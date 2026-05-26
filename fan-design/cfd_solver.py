# cfd_solver.py

import torch
import torch.nn.functional as F

class PyTorchCFD:
    def __init__(self, grid_size, device):
        self.grid_size = grid_size
        self.device = device
        
        x = torch.linspace(-1, 1, grid_size, device=device)
        y = torch.linspace(-1, 1, grid_size, device=device)
        z = torch.linspace(-1, 1, grid_size, device=device)
        self.Z, self.Y, self.X = torch.meshgrid(z, y, x, indexing='ij')
        
        self.omega = 2.0
        
        # Solid velocity field (Z, Y, X channels)
        # The fan rotates in the XY plane. V_x = -omega * y, V_y = omega * x, V_z = 0
        self.v_solid = torch.stack([
            torch.zeros_like(self.Z),
            self.omega * self.X,
            -self.omega * self.Y
        ], dim=0).unsqueeze(0)
        
    def advect(self, field, velocity, dt):
        """
        Pure tensor upwind advection.
        Replaces F.grid_sample to eliminate the CPU fallback on Apple Silicon (MPS).
        This allows the simulation to run 100% on the GPU without memory transfers!
        """
        dx = 2.0 / self.grid_size
        
        v_z = velocity[:, 0:1, ...]
        v_y = velocity[:, 1:2, ...]
        v_x = velocity[:, 2:3, ...]
        
        # Z-axis advection (Periodic boundary is handled naturally by torch.roll)
        field_z_b = torch.roll(field, 1, dims=2)
        field_z_f = torch.roll(field, -1, dims=2)
        adv_z = torch.clamp(v_z, min=0.0) * (field - field_z_b) + torch.clamp(v_z, max=0.0) * (field_z_f - field)
        
        # Y-axis advection
        field_y_b = torch.roll(field, 1, dims=3)
        field_y_f = torch.roll(field, -1, dims=3)
        adv_y = torch.clamp(v_y, min=0.0) * (field - field_y_b) + torch.clamp(v_y, max=0.0) * (field_y_f - field)
        
        # X-axis advection
        field_x_b = torch.roll(field, 1, dims=4)
        field_x_f = torch.roll(field, -1, dims=4)
        adv_x = torch.clamp(v_x, min=0.0) * (field - field_x_b) + torch.clamp(v_x, max=0.0) * (field_x_f - field)
        
        return field - (dt / dx) * (adv_z + adv_y + adv_x)

    def project(self, velocity, density, iterations=10):
        # Central difference for divergence (periodic boundaries via roll)
        div = (torch.roll(velocity[:, 0], -1, dims=1) - torch.roll(velocity[:, 0], 1, dims=1) +
               torch.roll(velocity[:, 1], -1, dims=2) - torch.roll(velocity[:, 1], 1, dims=2) +
               torch.roll(velocity[:, 2], -1, dims=3) - torch.roll(velocity[:, 2], 1, dims=3)) / 2.0
        div = div.unsqueeze(1)
        
        p = torch.zeros_like(div)
        fluid_mask = 1.0 - density.unsqueeze(0).unsqueeze(0)
        
        for _ in range(iterations):
            p_neighbors = (torch.roll(p, -1, dims=2) + torch.roll(p, 1, dims=2) +
                           torch.roll(p, -1, dims=3) + torch.roll(p, 1, dims=3) +
                           torch.roll(p, -1, dims=4) + torch.roll(p, 1, dims=4))
            p = (p_neighbors - div) / 6.0
            p = p * fluid_mask
            
        grad_p_z = (torch.roll(p, -1, dims=2) - torch.roll(p, 1, dims=2)) / 2.0
        grad_p_y = (torch.roll(p, -1, dims=3) - torch.roll(p, 1, dims=3)) / 2.0
        grad_p_x = (torch.roll(p, -1, dims=4) - torch.roll(p, 1, dims=4)) / 2.0
        grad_p = torch.cat([grad_p_z, grad_p_y, grad_p_x], dim=1)
        
        return velocity - grad_p

    def diffuse(self, velocity, dt):
        """
        Simulates viscous friction (Navier-Stokes diffusion).
        This causes fluid to stick to walls, effectively choking flow through tiny holes
        and naturally penalizing 'swiss cheese' structures without needing artificial SIMP penalties!
        """
        dx = 2.0 / self.grid_size
        nu = 0.015 # Kinematic viscosity
        
        laplace_z = (torch.roll(velocity[:, 0:1], -1, dims=2) + torch.roll(velocity[:, 0:1], 1, dims=2) +
                     torch.roll(velocity[:, 0:1], -1, dims=3) + torch.roll(velocity[:, 0:1], 1, dims=3) +
                     torch.roll(velocity[:, 0:1], -1, dims=4) + torch.roll(velocity[:, 0:1], 1, dims=4)) - 6.0 * velocity[:, 0:1]
                     
        laplace_y = (torch.roll(velocity[:, 1:2], -1, dims=2) + torch.roll(velocity[:, 1:2], 1, dims=2) +
                     torch.roll(velocity[:, 1:2], -1, dims=3) + torch.roll(velocity[:, 1:2], 1, dims=3) +
                     torch.roll(velocity[:, 1:2], -1, dims=4) + torch.roll(velocity[:, 1:2], 1, dims=4)) - 6.0 * velocity[:, 1:2]
                     
        laplace_x = (torch.roll(velocity[:, 2:3], -1, dims=2) + torch.roll(velocity[:, 2:3], 1, dims=2) +
                     torch.roll(velocity[:, 2:3], -1, dims=3) + torch.roll(velocity[:, 2:3], 1, dims=3) +
                     torch.roll(velocity[:, 2:3], -1, dims=4) + torch.roll(velocity[:, 2:3], 1, dims=4)) - 6.0 * velocity[:, 2:3]
                     
        laplace = torch.cat([laplace_z, laplace_y, laplace_x], dim=1)
        
        # Explicit Euler diffusion step
        return velocity + (nu * dt / (dx**2)) * laplace

    def simulate(self, density_tensor, dt=0.2, steps=8):
        velocity = torch.zeros_like(self.v_solid)
        fluid_mask = 1.0 - density_tensor.unsqueeze(0).unsqueeze(0)
        solid_mask = density_tensor.unsqueeze(0).unsqueeze(0)
        
        for _ in range(steps):
            velocity = self.advect(velocity, velocity, dt)
            velocity = self.diffuse(velocity, dt)
            # The solid forces the fluid to move with it
            velocity = velocity * fluid_mask + self.v_solid * solid_mask
            velocity = self.project(velocity, density_tensor)
            velocity = velocity * fluid_mask + self.v_solid * solid_mask
            
        # Maximize average Z velocity (forward flow)
        z_vel = velocity[0, 0, :, :, :]
        airflow = torch.mean(z_vel)
        
        # In our hard-mask Eulerian model, fluid velocity inside the solid exactly matches v_solid.
        # This makes the local delta-v zero, preventing direct calculation of rotational drag force.
        # However, rotational aerodynamic drag is directly proportional to the surface area and 
        # scales with the SQUARE of the velocity (v^2). Since rotational velocity v = omega * r,
        # drag scales with r^2! 
        # Therefore, we calculate the surrogate mechanical power by weighting the fan volume by r^2.
        radius_sq = self.X**2 + self.Y**2
        power = torch.mean(density_tensor * radius_sq)
        
        return airflow, power
