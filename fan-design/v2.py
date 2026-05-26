import taichi as ti
import numpy as np
from skimage.measure import marching_cubes
import trimesh
import os

# -------------------------------------------------------------------------
# 1. Configuration & Hyperparameters
# -------------------------------------------------------------------------
class Config:
    N = 48                  
    dx = 1.0 / N            
    dt = 0.01               
    ITERATIONS = 200        
    
    WARMUP_STEPS = 80       # Flow state is reset each iteration
    TAPE_STEPS = 10         
    
    OMEGA = -2.0            # Clockwise Fan Rotation (Standard Reference Frame)
    ALPHA_MAX = 500.0       
    TARGET_VOL = 0.03       
    PITCH = 0.05            # Helical pitch for axial thrust generation
    NU = 0.003              # Kinematic viscosity (higher = faster steady-state)
    PRESSURE_ITERS_WARMUP = 80   # More pressure iters during warmup (no tape cost)
    PRESSURE_ITERS_TAPE = 40     # Fewer during tape to limit memory
    
    LR = 0.02
    BETA1 = 0.9
    BETA2 = 0.999
    EPS = 1e-8
    GRAD_CLIP = 5.0         # Per-element gradient clipping threshold
    
    CHECKPOINT_EVERY = 50   # Save intermediate STLs

# -------------------------------------------------------------------------
# 2. Main Optimizer Class
# -------------------------------------------------------------------------
@ti.data_oriented
class FanTopOpt:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.N = cfg.N
        
        self.density = ti.field(dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        self.filtered = ti.field(dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        self.physical = ti.field(dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        
        self.m = ti.field(dtype=float, shape=(self.N, self.N, self.N))
        self.v = ti.field(dtype=float, shape=(self.N, self.N, self.N))
        
        self.velocity = ti.Vector.field(3, dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        self.next_velocity = ti.Vector.field(3, dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        self.pressure = ti.field(dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        self.next_pressure = ti.field(dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        self.divergence = ti.field(dtype=float, shape=(self.N, self.N, self.N), needs_grad=True)
        
        self.loss = ti.field(dtype=float, shape=(), needs_grad=True)
        self.metric_airflow = ti.field(dtype=float, shape=())
        self.metric_drag = ti.field(dtype=float, shape=())
        self.metric_volume = ti.field(dtype=float, shape=())
        self.total_vol = ti.field(dtype=float, shape=(), needs_grad=True)
        self.metric_efficiency = ti.field(dtype=float, shape=())

    @ti.kernel
    def initialize_density(self):
        for i, j, k in self.density:
            center = self.N / 2.0
            rx = float(i) - center
            ry = float(j) - center
            rz = float(k) - center
            r = ti.sqrt(rx**2 + ry**2)
            theta = ti.atan2(ry, rx)
            
            if r < self.N * 0.05 and abs(rz) < self.N * 0.15:
                self.density[i, j, k] = 1.0
            elif r < self.N * 0.45 and abs(rz) < self.N * 0.15:
                # BREAK SYMMETRY: Provide a 3-blade helical bias so the 
                # optimizer immediately senses an axial thrust gradient.
                helical_bias = ti.sin(3.0 * theta + rz * 0.5) 
                seed = self.cfg.TARGET_VOL + helical_bias * 0.05
                self.density[i, j, k] = ti.max(0.01, ti.min(0.99, seed))
            else:
                self.density[i, j, k] = 0.01
                
            self.m[i, j, k] = 0.0
            self.v[i, j, k] = 0.0
            
        self.velocity.fill(0.0)
        self.pressure.fill(0.0)

    @ti.kernel
    def apply_filter(self):
        for i, j, k in self.density:
            sum_val = 0.0
            count = 0.0
            for di in range(-1, 2):
                for dj in range(-1, 2):
                    for dk in range(-1, 2):
                        ni = i + di
                        nj = j + dj
                        nk = (k + dk + self.N) % self.N # Periodic filter in Z
                        if 0 <= ni < self.N and 0 <= nj < self.N:
                            sum_val += self.density[ni, nj, nk]
                            count += 1.0
            self.filtered[i, j, k] = sum_val / count

    @ti.kernel
    def apply_projection(self, beta: float):
        for i, j, k in self.filtered:
            center = self.N / 2.0
            r = ti.sqrt((i - center)**2 + (j - center)**2)
            val = 1.0 / (1.0 + ti.exp(-beta * (self.filtered[i, j, k] - 0.5)))
            
            if r >= self.N * 0.45 or abs(k - center) >= self.N * 0.10:
                val = 0.0
            if r < self.N * 0.05 and abs(k - center) < self.N * 0.15:
                val = 1.0
                
            self.physical[i, j, k] = val

    @ti.kernel
    def solve_brinkman_boundaries(self):
        for i, j, k in self.velocity:
            center = self.N / 2.0
            rx = (i - center) * self.cfg.dx
            ry = (j - center) * self.cfg.dx
            
            r_grid = ti.sqrt((i - center)**2 + (j - center)**2)
            
            is_shroud = 1.0 if r_grid >= self.N * 0.46 else 0.0
            alpha_fan = self.cfg.ALPHA_MAX * self.physical[i, j, k]
            alpha_shroud = self.cfg.ALPHA_MAX * is_shroud
            
            vs_x = -self.cfg.OMEGA * ry
            vs_y = self.cfg.OMEGA * rx
            vs_z = 0.0  
            
            v_curr = self.velocity[i, j, k]
            denom = 1.0 + self.cfg.dt * alpha_fan + self.cfg.dt * alpha_shroud
            
            # Dampen velocity at the Z-boundaries so it has to pull "still" air.
            # This kills the periodic infinite-acceleration loop.
            damping = 1.0
            if k <= 3 or k >= self.N - 4:
                damping = 0.5 
                
            v_new_x = ((v_curr[0] + self.cfg.dt * alpha_fan * vs_x) / denom) * damping
            v_new_y = ((v_curr[1] + self.cfg.dt * alpha_fan * vs_y) / denom) * damping
            v_new_z = ((v_curr[2] + self.cfg.dt * alpha_fan * vs_z) / denom) * damping

            if i <= 1 or i >= self.N - 2 or j <= 1 or j >= self.N - 2:
                v_new_x, v_new_y, v_new_z = 0.0, 0.0, 0.0

            self.next_velocity[i, j, k] = ti.Vector([v_new_x, v_new_y, v_new_z])

    @ti.kernel
    def advect_velocity(self):
        for i, j, k in self.velocity:
            if 1 < i < self.N-2 and 1 < j < self.N-2:
                v = self.velocity[i, j, k]
                v_next = ti.Vector([0.0, 0.0, 0.0])
                
                k_back = (k - 1 + self.N) % self.N
                k_fwd  = (k + 1) % self.N
                
                for c in ti.static(range(3)):
                    dx_back = (self.velocity[i, j, k][c] - self.velocity[i-1, j, k][c]) / self.cfg.dx
                    dx_fwd  = (self.velocity[i+1, j, k][c] - self.velocity[i, j, k][c]) / self.cfg.dx
                    adv_x = v[0] * dx_back if v[0] > 0 else v[0] * dx_fwd
                    
                    dy_back = (self.velocity[i, j, k][c] - self.velocity[i, j-1, k][c]) / self.cfg.dx
                    dy_fwd  = (self.velocity[i, j+1, k][c] - self.velocity[i, j, k][c]) / self.cfg.dx
                    adv_y = v[1] * dy_back if v[1] > 0 else v[1] * dy_fwd
                    
                    dz_back = (self.velocity[i, j, k][c] - self.velocity[i, j, k_back][c]) / self.cfg.dx
                    dz_fwd  = (self.velocity[i, j, k_fwd][c] - self.velocity[i, j, k][c]) / self.cfg.dx
                    adv_z = v[2] * dz_back if v[2] > 0 else v[2] * dz_fwd
                    
                    v_next[c] = v[c] - self.cfg.dt * (adv_x + adv_y + adv_z)
                    
                self.next_velocity[i, j, k] = v_next
            else:
                self.next_velocity[i, j, k] = ti.Vector([0.0, 0.0, 0.0])

    # Explicit viscous diffusion term (ν∇²v).
    @ti.kernel
    def diffuse_velocity(self):
        for i, j, k in self.velocity:
            if 1 < i < self.N-2 and 1 < j < self.N-2:
                k_back = (k - 1 + self.N) % self.N
                k_fwd  = (k + 1) % self.N
                
                laplacian = (
                    self.velocity[i+1, j, k] + self.velocity[i-1, j, k] +
                    self.velocity[i, j+1, k] + self.velocity[i, j-1, k] +
                    self.velocity[i, j, k_fwd] + self.velocity[i, j, k_back] -
                    6.0 * self.velocity[i, j, k]
                ) / (self.cfg.dx ** 2)
                
                self.next_velocity[i, j, k] = self.velocity[i, j, k] + self.cfg.NU * self.cfg.dt * laplacian
            else:
                self.next_velocity[i, j, k] = ti.Vector([0.0, 0.0, 0.0])

    @ti.kernel
    def update_velocity(self):
        for i, j, k in self.velocity:
            self.velocity[i, j, k] = self.next_velocity[i, j, k]

    @ti.kernel
    def solve_pressure_divergence(self):
        for i, j, k in self.divergence:
            if 1 < i < self.N-2 and 1 < j < self.N-2:
                k_back = (k - 1 + self.N) % self.N
                k_fwd  = (k + 1) % self.N
                
                vx_diff = self.velocity[i+1, j, k][0] - self.velocity[i-1, j, k][0]
                vy_diff = self.velocity[i, j+1, k][1] - self.velocity[i, j-1, k][1]
                vz_diff = self.velocity[i, j, k_fwd][2] - self.velocity[i, j, k_back][2]
                self.divergence[i, j, k] = (vx_diff + vy_diff + vz_diff) / (2.0 * self.cfg.dx)

    @ti.kernel
    def jacobi_pressure(self):
        for i, j, k in self.pressure:
            if 1 < i < self.N-2 and 1 < j < self.N-2:
                k_back = (k - 1 + self.N) % self.N
                k_fwd  = (k + 1) % self.N
                
                p_neighbors = (self.pressure[i+1, j, k] + self.pressure[i-1, j, k] +
                               self.pressure[i, j+1, k] + self.pressure[i, j-1, k] +
                               self.pressure[i, j, k_fwd] + self.pressure[i, j, k_back])
                self.next_pressure[i, j, k] = (p_neighbors - self.cfg.dx**2 * self.divergence[i, j, k]) / 6.0

    @ti.kernel
    def update_pressure(self):
        for i, j, k in self.pressure:
            self.pressure[i, j, k] = self.next_pressure[i, j, k]

    @ti.kernel
    def project_velocity(self):
        for i, j, k in self.velocity:
            if 1 < i < self.N-2 and 1 < j < self.N-2:
                k_back = (k - 1 + self.N) % self.N
                k_fwd  = (k + 1) % self.N
                
                grad_p_x = (self.pressure[i+1, j, k] - self.pressure[i-1, j, k]) / (2.0 * self.cfg.dx)
                grad_p_y = (self.pressure[i, j+1, k] - self.pressure[i, j-1, k]) / (2.0 * self.cfg.dx)
                grad_p_z = (self.pressure[i, j, k_fwd] - self.pressure[i, j, k_back]) / (2.0 * self.cfg.dx)
                
                self.velocity[i, j, k][0] -= grad_p_x
                self.velocity[i, j, k][1] -= grad_p_y
                self.velocity[i, j, k][2] -= grad_p_z

    def physics_step_inner(self, pressure_iters: int):
        self.solve_brinkman_boundaries()
        self.update_velocity()
        self.advect_velocity()
        self.update_velocity()
        self.diffuse_velocity()
        self.update_velocity()
        self.solve_pressure_divergence()
        for _ in range(pressure_iters):
            self.jacobi_pressure()
            self.update_pressure()
        self.project_velocity()

    # Only count airflow in the FLUID region. Without this, the optimizer
    # creates a solid disc and "cheats" by counting Brinkman-injected velocity
    # inside the solid as airflow. Weighting by (1-physical) forces the
    # optimizer to create blade channels where air genuinely flows.
    @ti.kernel
    def compute_aerodynamics(self, thrust_wt: float, drag_wt: float):
        for i, j, k in self.physical:
            center = self.N / 2.0
            
            fluid_weight = 1.0 - self.physical[i, j, k]
            airflow = self.velocity[i, j, k][2] * fluid_weight
            
            rx = (i - center) * self.cfg.dx
            ry = (j - center) * self.cfg.dx
            r = ti.sqrt(rx**2 + ry**2)
            
            vs_x = -self.cfg.OMEGA * ry
            vs_y = self.cfg.OMEGA * rx
            v_r = self.velocity[i, j, k]
            
            alpha = self.cfg.ALPHA_MAX * self.physical[i, j, k]
            force_x = alpha * (vs_x - v_r[0])
            force_y = alpha * (vs_y - v_r[1])
            mechanical_power = force_x * vs_x + force_y * vs_y
            
            # STRUCTURAL PENALTY: Heavily penalize material far from the hub. 
            # This prevents floating islands and forces a root connection.
            structural_penalty = self.physical[i, j, k] * r * 0.05
            
            self.loss[None] += -(airflow * thrust_wt) + (mechanical_power * drag_wt) + structural_penalty
            
            self.metric_airflow[None] += airflow
            self.metric_drag[None] += mechanical_power

    @ti.kernel
    def compute_total_volume(self):
        for i, j, k in self.physical:
            self.total_vol[None] += self.physical[i, j, k]
            
    @ti.kernel
    def compute_volume_loss_scalar(self, vol_wt: float):
        target_vol = (self.N ** 3) * self.cfg.TARGET_VOL
        diff = self.total_vol[None] - target_vol
        self.loss[None] += diff * diff * 0.01 * vol_wt
        self.metric_volume[None] = self.total_vol[None]

    @ti.kernel
    def step_adam(self, t: int):
        for i, j, k in self.density:
            grad = self.density.grad[i, j, k]
            
            # Gradient clipping to prevent aggressive updates from noisy grads
            grad = ti.max(-self.cfg.GRAD_CLIP, ti.min(self.cfg.GRAD_CLIP, grad))
            
            self.m[i, j, k] = self.cfg.BETA1 * self.m[i, j, k] + (1.0 - self.cfg.BETA1) * grad
            self.v[i, j, k] = self.cfg.BETA2 * self.v[i, j, k] + (1.0 - self.cfg.BETA2) * (grad * grad)
            
            m_hat = self.m[i, j, k] / (1.0 - self.cfg.BETA1**t)
            v_hat = self.v[i, j, k] / (1.0 - self.cfg.BETA2**t)
            
            new_val = self.density[i, j, k] - self.cfg.LR * m_hat / (ti.sqrt(v_hat) + self.cfg.EPS)
            self.density[i, j, k] = ti.max(0.0, ti.min(1.0, new_val))

    def reset_physics_gradients(self):
        self.loss[None] = 0.0
        self.density.grad.fill(0.0)
        self.filtered.grad.fill(0.0)
        self.physical.grad.fill(0.0)
        
        self.velocity.grad.fill(0.0)
        self.next_velocity.grad.fill(0.0)
        self.pressure.grad.fill(0.0)
        self.next_pressure.grad.fill(0.0)
        self.divergence.grad.fill(0.0)
        
        self.loss.grad.fill(0.0)
        self.loss.grad[None] = 1.0
        
        self.total_vol.grad.fill(0.0)
        self.total_vol[None] = 0.0
        
        self.metric_airflow[None] = 0.0
        self.metric_drag[None] = 0.0
        self.metric_volume[None] = 0.0
        self.metric_efficiency[None] = 0.0

# -------------------------------------------------------------------------
# 3. Execution & Export
# -------------------------------------------------------------------------
def export_to_stl(density_field, filename="fan-design/result.stl"):
    print("\nExtracting geometry...")
    voxels = density_field.to_numpy()
    
    v_max, v_min = voxels.max(), voxels.min()
    if v_max - v_min < 1e-4:
        print("Error: Density field is completely empty or solid.")
        return
    
    # Use 0.5 threshold for the projected density field (values are 0 or 1
    # with a sigmoid transition). The old (vmax+vmin)/2 heuristic would pick
    # a bad level when most of the grid is empty.
    level = 0.5
    try:
        verts, faces, normals, values = marching_cubes(voxels, level=level)
        faces_flipped = faces[:, ::-1] 
        mesh = trimesh.Trimesh(vertices=verts, faces=faces_flipped)
        os.makedirs(os.path.dirname(filename) if os.path.dirname(filename) else '.', exist_ok=True)
        mesh.export(filename)
        print(f"Exported mesh ({len(faces)} faces) to {filename}")
    except ValueError as e:
        print(f"Marching cubes failed: {e}")

def run_optimization():
    ti.init(arch=ti.metal, default_fp=ti.f32)
    cfg = Config()
    optimizer = FanTopOpt(cfg)
    
    print(f"Fan Topology Optimizer at {cfg.N}^3")
    print(f"  ν={cfg.NU}, pitch={cfg.PITCH}, "
          f"pressure_iters={cfg.PRESSURE_ITERS_WARMUP}/{cfg.PRESSURE_ITERS_TAPE} (warmup/tape)")
    print(f"  warmup={cfg.WARMUP_STEPS}, tape={cfg.TAPE_STEPS}, "
          f"grad_clip={cfg.GRAD_CLIP}, lr={cfg.LR}")
    optimizer.initialize_density()
    
    best_loss = float('inf')
    
    for opt_iter in range(1, cfg.ITERATIONS + 1):
        
        # Reset ALL flow state so each iteration is independent.
        optimizer.velocity.fill(0.0)
        optimizer.pressure.fill(0.0)
        optimizer.next_velocity.fill(0.0)
        optimizer.next_pressure.fill(0.0)
        optimizer.divergence.fill(0.0)
        
        beta = 1.0 + 9.0 * max(0.0, (opt_iter - cfg.ITERATIONS * 0.2) / (cfg.ITERATIONS * 0.8))
        
        thrust_wt = 10.0    # Moderate weight: fluid-only airflow is a weaker signal
        
        drag_wt = 0.0
        vol_wt = 0.0
        if opt_iter > 30:
            progress = min(1.0, (opt_iter - 30) / 60.0)
            drag_wt = 0.005 * progress
            vol_wt = 1.0 * progress

        # Compute geometry ONCE (outside physics loop)
        optimizer.apply_filter()
        optimizer.apply_projection(beta)
            
        # Warmup with more pressure iterations (no tape cost)
        for t in range(cfg.WARMUP_STEPS):
            optimizer.physics_step_inner(cfg.PRESSURE_ITERS_WARMUP)
            
        optimizer.reset_physics_gradients()
        
        with ti.ad.Tape(loss=optimizer.loss):
            # filter/projection inside tape for gradient chain
            optimizer.apply_filter()
            optimizer.apply_projection(beta)
            
            # Fewer pressure iterations during tape to limit memory
            for t in range(cfg.TAPE_STEPS):
                optimizer.physics_step_inner(cfg.PRESSURE_ITERS_TAPE)
                optimizer.compute_aerodynamics(thrust_wt, drag_wt)
                    
            optimizer.compute_total_volume()
            optimizer.compute_volume_loss_scalar(vol_wt)
            
        optimizer.step_adam(opt_iter)
        
        cur_loss = optimizer.loss[None]
        avg_airflow = optimizer.metric_airflow[None] / cfg.TAPE_STEPS
        avg_drag = optimizer.metric_drag[None] / cfg.TAPE_STEPS
        vol = optimizer.metric_volume[None]
        
        # Track best
        if cur_loss < best_loss:
            best_loss = cur_loss
            marker = " *"
        else:
            marker = ""
        
        # Efficiency: airflow per unit drag (higher = better fan)
        efficiency = avg_airflow / max(avg_drag, 1e-8)
        
        print(f"Iter {opt_iter:03d} | Loss: {cur_loss:.1f} | "
              f"Airflow: {avg_airflow:.2f} | Drag: {avg_drag:.0f} | "
              f"Vol: {vol:.0f} | Eff: {efficiency:.2e}{marker}")
        
        # Periodic checkpoints
        if cfg.CHECKPOINT_EVERY > 0 and opt_iter % cfg.CHECKPOINT_EVERY == 0:
            export_to_stl(optimizer.physical, f"fan-design/checkpoint_{opt_iter:03d}.stl")

    export_to_stl(optimizer.physical)

if __name__ == "__main__":
    run_optimization()