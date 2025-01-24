import pygame
import math
import cmath

# Pygame setup
pygame.init()
width, height = 800, 800
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption('Hyperbolic Pentagon Tiling')

# Colors
background_color = (0, 0, 0)
pentagon_color = (255, 255, 255)

# Hyperbolic geometry constants
RADIUS = 1.0  # Radius of the Poincaré disk
num_sides = 5  # Pentagon

def poincare_to_screen(z):
    """Convert a point from the Poincaré disk model to screen coordinates."""
    x, y = z.real, z.imag
    return (int(width // 2 + x * width // 2), int(height // 2 - y * height // 2))

def draw_pentagon(center, radius, color):
    """Draw a regular pentagon given a center and radius."""
    points = []
    for i in range(num_sides):
        angle = 2 * math.pi * i / num_sides
        x = center[0] + radius * math.cos(angle)
        y = center[1] + radius * math.sin(angle)
        points.append((x, y))
    
    pygame.draw.polygon(screen, color, points, 1)

def draw_hyperbolic_tiling(center, radius, depth):
    """Recursively draw pentagons in hyperbolic space."""
    if depth == 0:
        return
    
    # Draw the center pentagon
    draw_pentagon(center, radius, pentagon_color)
    
    # Calculate and draw surrounding pentagons
    angle_increment = 2 * math.pi / num_sides
    for i in range(num_sides):
        angle = i * angle_increment
        offset_x = radius * math.cos(angle)
        offset_y = radius * math.sin(angle)
        
        new_center = complex(center[0] + offset_x, center[1] + offset_y)
        new_center_poincare = (new_center / abs(new_center)) * (abs(new_center) / math.sqrt(1 + abs(new_center)**2))
        
        if abs(new_center_poincare) < RADIUS:
            screen_center = poincare_to_screen(new_center_poincare)
            draw_hyperbolic_tiling(screen_center, radius, depth - 1)

# Main loop
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
    
    screen.fill(background_color)
    
    # Initial pentagon
    center = (width // 2, height // 2)
    radius = width // 10
    depth = 3  # Recursion depth for tiling
    
    draw_hyperbolic_tiling(center, radius, depth)
    
    pygame.display.flip()

pygame.quit()
