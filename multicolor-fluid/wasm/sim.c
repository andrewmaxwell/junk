/*
cd multicolor-fluid/wasm
nodemon --watch sim.c -O3 --exec "emcc -o sim.js sim.c -s NO_EXIT_RUNTIME=1 -s \"EXPORTED_RUNTIME_METHODS=ccall\""
*/

#define max(a, b) \
  ({ __typeof__ (a) _a = (a); \
       __typeof__ (b) _b = (b); \
     _a > _b ? _a : _b; })

#define min(a, b) \
  ({ __typeof__ (a) _a = (a); \
       __typeof__ (b) _b = (b); \
     _a < _b ? _a : _b; })

#define CEILING(x, y) (((x) + (y)-1) / (y))

#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <time.h>
#include <emscripten/emscripten.h>

// import Grid from '../particle-fluid/Grid.js';

#define width 1200.0
#define height 800.0
#define numParticles 10000
#define numColors 2
#define radius 32.0
#define gravity 0.01
#define stiffness 100.0
#define repulsion 0.05
#define invRad2 1.0 / (radius * radius)
#define speed 10

#define rows CEILING(height, radius)
#define cols CEILING(width, radius)
#define cellSize 256
#define gridLength (int)(rows * cols * cellSize)
int grid[gridLength];

// current coordinates of particles
float xCoord[numParticles];
float yCoord[numParticles];

// previous calculated coordinates of particles
float xPrev[numParticles];
float yPrev[numParticles];

// previous rendered coordinates of particles
float xPrev2[numParticles];
float yPrev2[numParticles];

// used for storing intermediate calculations when figuring out how particles interact
int neighborIndex[cellSize];
float neighborGradient[cellSize];
float neighborX[cellSize];
float neighborY[cellSize];

float rando()
{
  return (float)rand() / (float)RAND_MAX;
}

void clearGrid()
{
  for (int i = 0; i < gridLength; i++)
  {
    grid[i] = 0;
  }
}

/*

The screen is split up into a grid. 
Each grid cell is [radius] wide and tall.
It is represented by [cellSize] ints.
The first one is the number of particles in that cell.
The rest are the indexes of the particles in that cell.
By using this grid, we don't have to compare each particle against each other particle, just the ones in the particle's cell and the (up to) 8 surround it.
*/
void addToGrid(int i)
{
  int row = max(0, min(rows - 1, floor(yCoord[i] / radius)));
  int col = max(0, min(cols - 1, floor(xCoord[i] / radius)));
  int cellIndex = (row * cols + col) * cellSize;
  if (grid[cellIndex] < cellSize - 1)
  {
    grid[++grid[cellIndex] + cellIndex] = i;
  }
}

void bounceOffWalls(int i)
{
  if (xCoord[i] < 0)
  {
    xCoord[i] = -xCoord[i];
  }
  else if (xCoord[i] > width - 1)
  {
    xCoord[i] = 2.0 * width - 2.0 - xCoord[i];
  }
  if (yCoord[i] < 0)
  {
    yCoord[i] = -yCoord[i];
  }
  else if (yCoord[i] > height - 1)
  {
    yCoord[i] = 2.0 * height - 2.0 - yCoord[i];
  }
}

void moveParticle(int i)
{
  float xVel = xCoord[i] - xPrev[i];
  float yVel = yCoord[i] - yPrev[i] + (float)(i % numColors) * gravity;
  xPrev[i] = xCoord[i];
  yPrev[i] = yCoord[i];
  xCoord[i] += xVel;
  yCoord[i] += yVel;
  bounceOffWalls(i);
}

void interactParticles()
{
  for (int i = 0; i < numParticles; i++)
  {
    int numNeighbors = 0;
    float nearDensity = 0;

    // for each of the 9 cells in this particle's vicinity
    // I think I could calculate some of this ahead of time to speed things up a bit.
    int row = max(0, min(rows - 1, floor(yCoord[i] / radius)));
    int col = max(0, min(cols - 1, floor(xCoord[i] / radius)));
    for (int r = max(0, row - 1); r <= min(rows - 1, row + 1); r++)
    {
      for (int c = max(0, col - 1); c <= min(cols - 1, col + 1); c++)
      {
        int cellIndex = (r * cols + c) * cellSize;

        // this loop calculates the forces between nearby particles
        for (int k = 1; k < grid[cellIndex]; k++)
        {
          int n = grid[cellIndex + k];
          if (n == i)
            continue;
          float dx = xCoord[n] - xCoord[i];
          float dy = yCoord[n] - yCoord[i];
          float lsq = dx * dx + dy * dy;

          // some of the particles in the vicinity are too far away
          if (lsq >= radius * radius)
            continue;

          float g = 1.0 - sqrt(lsq) / radius;
          nearDensity += g * g * g;
          neighborIndex[numNeighbors] = n;
          neighborGradient[numNeighbors] = g;
          neighborX[numNeighbors] = dx;
          neighborY[numNeighbors] = dy;
          numNeighbors++;
        }
      }
    }

    float nearPressure = stiffness * nearDensity * invRad2;

    // this loop applies the forces
    for (int k = 0; k < numNeighbors; k++)
    {
      int n = neighborIndex[k];
      float ng = neighborGradient[k];
      float amt =
          (n % numColors) == (i % numColors)
              ? (nearPressure * ng * ng) / (1.0 - ng) / radius
              : ng * ng * repulsion;
      float ax = neighborX[k] * amt;
      float ay = neighborY[k] * amt;
      xCoord[i] -= ax;
      yCoord[i] -= ay;
      xCoord[n] += ax;
      yCoord[n] += ay;
    }
  }
}

#define EXTERN
EXTERN EMSCRIPTEN_KEEPALIVE void init()
{
  time_t t;
  srand((unsigned)time(&t));
  for (int i = 0; i < numParticles; i++)
  {
    xCoord[i] = xPrev[i] = width * rando();
    yCoord[i] = yPrev[i] = height * rando();
  }
  printf("Created %d particles\n", numParticles);
}

EXTERN EMSCRIPTEN_KEEPALIVE void iterate()
{
  // copy coords
  for (int i = 0; i < numParticles; i++)
  {
    xPrev2[i] = xCoord[i];
    yPrev2[i] = yCoord[i];
  }

  for (int i = 0; i < speed; i++)
  {
    clearGrid();
    for (int i = 0; i < numParticles; i++)
    {
      moveParticle(i);
      addToGrid(i);
    };
    interactParticles();
  }
}

EXTERN EMSCRIPTEN_KEEPALIVE float *getX()
{
  return xCoord;
}

EXTERN EMSCRIPTEN_KEEPALIVE float *getY()
{
  return yCoord;
}

EXTERN EMSCRIPTEN_KEEPALIVE float *getPrevX()
{
  return xPrev2;
}

EXTERN EMSCRIPTEN_KEEPALIVE float *getPrevY()
{
  return yPrev2;
}