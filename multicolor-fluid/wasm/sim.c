/*
cd multicolor-fluid/wasm
nodemon --watch sim.c --exec "emcc -O3 -o sim.mjs sim.c"
*/

#define max(a, b) \
  ((a > b) * (a) + (a <= b) * (b))

#define min(a, b) \
  ((a < b) * (a) + (a >= b) * (b))

#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <time.h>
#include <emscripten/emscripten.h>

#define numParticles 16384
#define numColors 3
#define gravity 0.0009765625
#define stiffness 0.03125

#define rows 40
#define cols 75
#define radius 16.0
#define cellSize 256

// cols * radius
#define width 1200.0

// rows * radius
#define height 600.0

// rows * cols * cellSize
#define gridLength 768000
int grid[gridLength];

// rows * cols * 10
#define vicinityIndexLength 30000
int vicinityIndexes[vicinityIndexLength];

// current coordinates of particles
float xCoord[numParticles];
float yCoord[numParticles];

// previous calculated coordinates of particles
float xPrev[numParticles];
float yPrev[numParticles];

// previous rendered coordinates of particles
float xPrev2[numParticles];
float yPrev2[numParticles];

void setPrev2()
{
  for (int i = 0; i < numParticles; i++)
  {
    xPrev2[i] = xCoord[i];
    yPrev2[i] = yCoord[i];
  }
}

// to prevent calculating more than once, the vicinity index gets saved for each particle each frame
int cachedVicinityIndex[numParticles];

float rando()
{
  return (float)rand() / (float)RAND_MAX;
}

void clearGrid()
{
  for (int i = 0; i < gridLength; i += cellSize)
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
  int r = floor(yCoord[i] / radius);
  int c = floor(xCoord[i] / radius);
  int row = max(0, min(rows - 1, r));
  int col = max(0, min(cols - 1, c));
  int cellIndex = (row * cols + col) * cellSize;
  if (grid[cellIndex] < cellSize - 1)
  {
    int count = ++grid[cellIndex];
    grid[count + cellIndex] = i;
  }
  cachedVicinityIndex[i] = (row * cols + col) * 10;
}

void calculateVicinityIndexes()
{
  for (int i = 0; i < rows * cols * 10; i++)
  {
    vicinityIndexes[i] = 0;
  }
  for (int row = 0; row < rows; row++)
  {
    for (int col = 0; col < cols; col++)
    {
      int vicinityIndex = (row * cols + col) * 10;
      for (int r = max(0, row - 1); r <= min(rows - 1, row + 1); r++)
      {
        for (int c = max(0, col - 1); c <= min(cols - 1, col + 1); c++)
        {
          int count = ++vicinityIndexes[vicinityIndex];
          vicinityIndexes[count + vicinityIndex] = (r * cols + c) * cellSize;
        }
      }
    }
  }
}

void setInitialPositions()
{
  for (int i = 0; i < numParticles; i++)
  {
    xCoord[i] = xPrev[i] = width * rando();
    yCoord[i] = yPrev[i] = height * rando();
  }
}

void bounceOffWalls(int i)
{
  xCoord[i] = xCoord[i] < 0 
    ? -xCoord[i] 
    : xCoord[i] > width - 1 
    ? 2.0 * width - 2.0 - xCoord[i]
    : xCoord[i];

  yCoord[i] = yCoord[i] < 0 
    ? -yCoord[i] 
    : yCoord[i] > height - 1 
    ? 2.0 * height - 2.0 - yCoord[i]
    : yCoord[i];
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

// used for storing intermediate calculations when figuring out how particles interact
int neighborIndex[cellSize];
float neighborGradient[cellSize];
void interactParticles()
{
  for (int i = 0; i < numParticles; i++)
  {
    int numNeighbors = 0;
    float nearDensity = 0;

    // for each of the 9 cells in this particle's vicinity
    int vicIndex = cachedVicinityIndex[i];
    for (int j = 1; j < vicinityIndexes[vicIndex]; j++)
    {
      int cellIndex = vicinityIndexes[vicIndex + j];
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
        numNeighbors++;
      }
    }

    float nearPressure = stiffness * nearDensity;

    // this loop applies the forces
    for (int k = 0; k < numNeighbors; k++)
    {
      int n = neighborIndex[k];
      float ng = neighborGradient[k];
      int colorsSame = (n % numColors) == (i % numColors);
      float amt = nearPressure * ng * ng / (colorsSame * (1.0 - ng) * radius + !colorsSame);
      float ax = (xCoord[n] - xCoord[i]) * amt;
      float ay = (yCoord[n] - yCoord[i]) * amt;
      xCoord[i] -= ax;
      yCoord[i] -= ay;
      xCoord[n] += ax;
      yCoord[n] += ay;
    }
  }
}

void tick()
{
  clearGrid();
  for (int i = 0; i < numParticles; i++)
  {
    moveParticle(i);
    addToGrid(i);
  };
  interactParticles();
}

#define EXTERN
EXTERN EMSCRIPTEN_KEEPALIVE void init()
{
  time_t t;
  srand((unsigned)time(&t));
  setInitialPositions();
  calculateVicinityIndexes();
  printf("Created %d particles\n", numParticles);
}

EXTERN EMSCRIPTEN_KEEPALIVE void iterate()
{
  setPrev2();
  tick();
  tick();
  tick();
  tick();
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

EXTERN EMSCRIPTEN_KEEPALIVE void moveMouse (int x, int y, int xs, int ys) {
  for (int i = 0; i < numParticles; i++) {
    float dist = hypot(xCoord[i] - x, yCoord[i] - y);
    float amt = 0.05 * (1.0 - dist / 100.0);
    if (amt < 0) continue;
    xPrev[i] -= amt * xs;
    yPrev[i] -= amt * ys;
  }
}