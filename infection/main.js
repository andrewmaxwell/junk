const infectionProbability = 0.2;
const healSpeed = 0.01;
const width = 800;
const height = 600;

const dirs = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const canvas = document.createElement('canvas');
document.body.append(canvas);
document.body.style.margin = 0;

const ctx = canvas.getContext('2d');
canvas.width = width;
canvas.height = height;
const imageData = ctx.createImageData(width, height);

let grid, nextGrid;

const reset = () => {
  grid = [];
  nextGrid = [];
  for (let i = 0; i < height; i++) {
    grid[i] = [];
    nextGrid[i] = [];
    for (let j = 0; j < width; j++) {
      grid[i][j] = Math.random() < 0.01 ? Math.random() * 0.1 : 0;
    }
  }
};

const loop = () => {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      nextGrid[y][x] = grid[y][x];

      if (grid[y][x] > 0) nextGrid[y][x] -= healSpeed;
      else {
        let neighborInfection = 0;
        for (const [dx, dy] of dirs) {
          neighborInfection += grid[y + dy]?.[x + dx] || 0;
        }

        if (Math.random() < neighborInfection * infectionProbability) {
          nextGrid[y][x] = 1;
        }
      }

      const i = (y * width + x) * 4;
      imageData.data[i] = nextGrid[y][x] * 256;
      imageData.data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  [grid, nextGrid] = [nextGrid, grid];

  requestAnimationFrame(loop);
};

reset();
loop();
