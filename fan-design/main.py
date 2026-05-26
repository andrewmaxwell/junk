# main.py

import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'

import torch
import numpy as np
import matplotlib.pyplot as plt
from skimage.measure import marching_cubes
import trimesh

from cfd_solver import PyTorchCFD
from filters import TopologyFilters

# 1. Setup device
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
print(f"Running on device: {device}")

# 2. Hyperparameters
GRID_SIZE = 48         # Voxel grid resolution increased by 50%
LEARNING_RATE = 0.02
ITERATIONS = 2000    

# Build physical constraints
x, y = torch.meshgrid(torch.linspace(-1, 1, GRID_SIZE, device=device), 
                      torch.linspace(-1, 1, GRID_SIZE, device=device), indexing='ij')
radius = torch.sqrt(x**2 + y**2).unsqueeze(-1)
z = torch.linspace(-1, 1, GRID_SIZE, device=device).view(1, 1, GRID_SIZE)
theta = torch.atan2(y, x).unsqueeze(-1)

casing_mask = (radius > 0.95).float()

# Initialize the fan design with random noise
# Using randn with high variance so that even after the 5x5x5 filter averages it out,
# it still has enough variance to cross the 0.5 threshold and be visible at Iteration 0!
initial_voxels = torch.randn((GRID_SIZE, GRID_SIZE, GRID_SIZE), device=device) * 2.0 + 0.5
fan_voxels = initial_voxels.clone().detach().requires_grad_(True)
optimizer = torch.optim.Adam([fan_voxels], lr=LEARNING_RATE)

# Initialize Physics Solver
cfd_solver = PyTorchCFD(GRID_SIZE, device)

def export_to_stl(voxel_tensor, beta):
    """Converts the voxel grid to a smooth 3D mesh."""
    # Apply density filter
    filtered = TopologyFilters.apply_density_filter(voxel_tensor, filter_radius=3)
    
    # Upsample the CONTINUOUS field for a much smoother mesh export BEFORE projection.
    # This completely eliminates the "stair-casing" Minecraft artifact because we interpolate 
    # the smooth mathematical gradients instead of interpolating a jagged binary block.
    target_size = 128
    filtered_up = torch.nn.functional.interpolate(filtered.unsqueeze(0).unsqueeze(0), size=(target_size, target_size, target_size), mode='trilinear', align_corners=True).squeeze()
    
    # Now project the upsampled high-res field into a solid shape!
    density_up = TopologyFilters.heaviside_projection(filtered_up, beta=beta)
    
    # Re-apply masks on upsampled grid to keep them sharp
    x_up, y_up = torch.meshgrid(torch.linspace(-1, 1, target_size, device=density.device), 
                                torch.linspace(-1, 1, target_size, device=density.device), indexing='ij')
    radius_up = torch.sqrt(x_up**2 + y_up**2).unsqueeze(-1)
    
    casing_mask_up = (radius_up > 0.95).float()
    
    density_up = torch.where(casing_mask_up > 0.5, torch.zeros_like(density_up), density_up)
    
    voxels_np = density_up.detach().cpu().numpy()
    try:
        verts, faces, normals, values = marching_cubes(voxels_np, level=0.5)
        # Flip face winding order to ensure correct outward normals in standard viewers
        faces_flipped = faces[:, ::-1]
        mesh = trimesh.Trimesh(vertices=verts, faces=faces_flipped)
        filename = f"fan-design/result.stl"
        mesh.export(filename)
        return verts, faces, normals
    except ValueError:
        return None, None, None

# --- Main Optimization Loop ---
history_fitness = []

plt.ion() # Interactive mode for live charting
fig = plt.figure(figsize=(12, 6))
ax_chart = fig.add_subplot(121)
ax_3d = fig.add_subplot(122, projection='3d')
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

for i in range(ITERATIONS):
    optimizer.zero_grad()
    
    # 0. Density Filter (Enforce minimum length scale to prevent noise)
    # Using filter_radius=3 forces the minimum feature size to be 7 voxels thick,
    # ensuring the final shape is a solid, completely hole-free block of plastic.
    filtered_voxels = TopologyFilters.apply_density_filter(fan_voxels, filter_radius=3)
    
    # 1. Continuation Method (Gradually solidify the structure)
    # Smoothly ramp beta from 1.0 to 20.0 over the course of the optimization
    if i < int(ITERATIONS * 0.1):
        beta = 1.0
    else:
        progress = min((i - int(ITERATIONS * 0.1)) / (ITERATIONS * 0.7), 1.0)
        beta = 1.0 + progress * 19.0 # Max beta of 20.0
        
    density = TopologyFilters.heaviside_projection(filtered_voxels, beta=beta)
    
    # Enforce physical constraints mathematically
    density = torch.where(casing_mask > 0.5, torch.zeros_like(density), density)
    
    # 2. Run the physics simulation
    # Dynamically calculate time step (dt) to obey the CFL condition (v_max * dt < dx)
    safe_dt = 0.64 / GRID_SIZE
    safe_steps = int(0.4 / safe_dt)
    airflow, power = cfd_solver.simulate(density, dt=safe_dt, steps=safe_steps)
    
    # 3. Apply Filters
    # Center of Mass Balance Penalty (prevent vibration)
    # x and y coordinates are from the meshgrid defined above
    mass = torch.mean(density) + 1e-5
    com_x = torch.mean(density * x) / mass
    com_y = torch.mean(density * y) / mass
    balance_penalty = com_x**2 + com_y**2
    
    # 4. Calculate Final Fitness and Loss
    physics_loss = -airflow * 2000.0 + (power**2) * 10000.0
    
    # We completely removed the artificial SIMP penalty! The optimizer will now 
    # rely 100% on actual fluid physics (Navier-Stokes viscosity) to eliminate holes!
    # Balance penalty lowered to 5.0 to allow for more asymmetric fan blade discovery.
    loss = physics_loss + (5.0 * balance_penalty)
    
    # Calculate gradients
    loss.backward()
    optimizer.step()
    
    current_fitness = airflow.item()
    history_fitness.append(current_fitness)
    
    print(f"Iteration {i}: Airflow = {current_fitness:.4f} | Power = {power.item():.4f} | Balance = {balance_penalty.item():.4f}")
    if i % 5 == 0 or i == ITERATIONS - 1:
        ax_chart.clear()
        ax_chart.plot(history_fitness, label="Forward Airflow")
        ax_chart.set_title("Topology Optimization Progress")
        ax_chart.set_xlabel("Iteration")
        ax_chart.set_ylabel("Airflow Velocity")
        ax_chart.legend()
        
        ax_3d.clear()
        voxels_np = density.detach().cpu().numpy()
        try:
            # Dynamically adjust the contour level to the exact midpoint to guarantee
            # we never crash marching_cubes with out-of-bounds values!
            v_max = voxels_np.max()
            v_min = voxels_np.min()
            
            if v_max - v_min > 1e-4:
                level = (v_max + v_min) / 2.0
                verts, faces, normals, values = marching_cubes(voxels_np, level=level)
                
                # Calculate Lambertian shading for beautiful 3D rendering
                face_normals = normals[faces].mean(axis=1)
                light_dir = np.array([1.0, 0.5, 1.0])
                light_dir = light_dir / np.linalg.norm(light_dir)
                intensity = np.clip(np.dot(face_normals, light_dir), 0, 1)
                
                colors = np.zeros((len(faces), 4))
                colors[:, 0] = 0.1 * intensity + 0.1
                colors[:, 1] = 0.4 * intensity + 0.2
                colors[:, 2] = 0.8 * intensity + 0.2
                colors[:, 3] = 0.8 # Alpha 0.8
                
                mesh = Poly3DCollection(verts[faces], facecolors=colors)
                ax_3d.add_collection3d(mesh)
                
                # Add a real-time drop shadow on the "ground" (Z=0)
                verts_shadow = verts.copy()
                verts_shadow[:, 2] = 0 # Flatten to the floor
                shadow_colors = np.zeros((len(faces), 4))
                shadow_colors[:, 0:3] = 0.8 # Light gray
                shadow_colors[:, 3] = 1.0 # Fully opaque so overlapping polygons don't stack weirdly
                shadow_mesh = Poly3DCollection(verts_shadow[faces], facecolors=shadow_colors)
                ax_3d.add_collection3d(shadow_mesh)
                ax_3d.set_xlim(0, GRID_SIZE)
                ax_3d.set_ylim(0, GRID_SIZE)
                ax_3d.set_zlim(0, GRID_SIZE)
                ax_3d.view_init(elev=30, azim=i * 2) # Rotate automatically
                ax_3d.axis('off')
                ax_3d.set_title(f"Iteration {i}")
        except ValueError:
            pass
        plt.pause(0.01)

verts, faces, normals = export_to_stl(fan_voxels, beta=21.0)
print("Optimization Complete! Check your folder for result.stl")

if verts is not None:
    ax_3d.clear()
    
    # Shade the final high-resolution mesh
    face_normals = normals[faces].mean(axis=1)
    light_dir = np.array([1.0, 0.5, 1.0])
    light_dir = light_dir / np.linalg.norm(light_dir)
    intensity = np.clip(np.dot(face_normals, light_dir), 0, 1)
    
    colors = np.zeros((len(faces), 4))
    colors[:, 0] = 0.1 * intensity + 0.1
    colors[:, 1] = 0.4 * intensity + 0.2
    colors[:, 2] = 0.8 * intensity + 0.2
    colors[:, 3] = 1.0 # Fully opaque for the final render
    
    mesh = Poly3DCollection(verts[faces], facecolors=colors)
    ax_3d.add_collection3d(mesh)
    
    # Add high-res shadow
    verts_shadow = verts.copy()
    verts_shadow[:, 2] = 0
    shadow_colors = np.zeros((len(faces), 4))
    shadow_colors[:, 0:3] = 0.8
    shadow_colors[:, 3] = 1.0
    shadow_mesh = Poly3DCollection(verts_shadow[faces], facecolors=shadow_colors)
    ax_3d.add_collection3d(shadow_mesh)
    
    # The upsampled export grid is 128x128x128
    ax_3d.set_xlim(0, 128)
    ax_3d.set_ylim(0, 128)
    ax_3d.set_zlim(0, 128)
    ax_3d.axis('off')
    ax_3d.set_title("Final High-Resolution Render")

print("Rotating final result... Close the window to exit.")

# Keep rotating the final fan until the user closes the window
angle = ITERATIONS * 2
while plt.fignum_exists(fig.number):
    ax_3d.view_init(elev=30, azim=angle)
    angle = (angle + 2) % 360
    try:
        plt.pause(0.05)
    except:
        break