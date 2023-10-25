const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const width = (canvas.width = 800);
const height = (canvas.height = 600);

const speed = 100;
const colors = [
  {color: '#00F', turn: 0},
  {color: '#0FF', turn: 1},
  // {color: 'green', turn: 1},
  // {color: 'purple', turn: 1},
];
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
  for (let i = 0; i < speed; ++i) {
    const val = grid[ant.y][ant.x];
    const {color, turn} = colors[val % colors.length];
    ant.dir = (ant.dir + turn) % dirs.length;
    grid[ant.y][ant.x] = (val + 1) % colors.length;

    ctx.fillStyle = color;
    ctx.fillRect(ant.x, ant.y, 1, 1);

    const [dx, dy] = dirs[ant.dir];
    ant.x = (ant.x + dx + width) % width;
    ant.y = (ant.y + dy + height) % height;
  }

  requestAnimationFrame(loop);
};
loop();
