# filters.py

import torch
import torch.nn.functional as F

class TopologyFilters:
    @staticmethod
    def apply_density_filter(voxels, filter_radius=1):
        """
        Applies a spatial low-pass filter to the design variables.
        This enforces a minimum length scale, preventing checkerboarding and high-frequency noise.
        """
        kernel_size = 2 * filter_radius + 1
        # Simple 3D average pooling (Helmholtz-like filter)
        kernel = torch.ones((1, 1, kernel_size, kernel_size, kernel_size), device=voxels.device)
        kernel = kernel / (kernel_size**3)
        
        voxels_expanded = voxels.unsqueeze(0).unsqueeze(0)
        # padding=filter_radius ensures the output size matches the input size
        smoothed = F.conv3d(voxels_expanded, kernel, padding=filter_radius)
        return smoothed.squeeze()

    @staticmethod
    def heaviside_projection(voxels, beta=1.0, eta=0.5):
        """
        Projects continuous voxels to a solid design using a continuation method.
        Uses a steepened sigmoid to guarantee outputs strictly in [0, 1].
        """
        return torch.sigmoid(beta * (voxels - eta))

