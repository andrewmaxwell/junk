const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const width = (canvas.width = 600);
const height = (canvas.height = 400);

const colors = ['purple', 'blue', 'red', 'grey', 'olive'];
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
const grid = [];
for (let i = 0; i < height; ++i) {
  grid[i] = new Array(width).fill(0);
}

const ant = {
  x: Math.floor(width / 2),
  y: Math.floor(height / 2),
  dir: 0,
};

const loop = () => {
  for (let i = 0; i < 500; ++i) {
    const [dx, dy] = dirs[ant.dir % dirs.length];
    ant.x = (ant.x + dx + width) % width;
    ant.y = (ant.y + dy + height) % height;

    const curPos = grid[ant.y][ant.x];
    ant.dir += curPos % 2 ? 1 : 3;
    grid[ant.y][ant.x] = (curPos + 1) % colors.length;

    ctx.fillStyle = colors[curPos % colors.length];
    ctx.fillRect(ant.x, ant.y, 1, 1);
  }

  requestAnimationFrame(loop);
};
loop();
