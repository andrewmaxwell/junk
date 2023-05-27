import {Renderer} from './Renderer.js';

const params = {
  rows: 64,
  minToStayAlive: 2,
  maxToStayAlive: 3,
  minForSpawn: 3,
  maxForSpawn: 3,
  speed: 10,
};

const canvas = document.querySelector('canvas');
const renderer = new Renderer(canvas);
let mouse = {x: 0, y: 0};

let g1, g2, paused;

const reset = (randomize = true) => {
  const cols = Math.round(
    (params.rows / innerHeight) * innerWidth * Math.sqrt(3)
  );
  g1 = [];
  g2 = [];
  for (let y = 0; y < params.rows; y++) {
    g1[y] = new Array(cols).fill(0);
    g2[y] = new Array(cols).fill(0);
    if (randomize) {
      for (let x = 0; x < cols; x++) {
        g1[y][x] = Math.random() < 0.5 ? 0 : 1;
      }
    }
  }
  renderer.render(g1, mouse);
};

const get = (x, y) => g1[y]?.[x] || 0;
const set = (x, y, v) => {
  if (typeof g1[y]?.[x] !== 'undefined') g1[y][x] = v;
};
const getNumLivingNeighbors = (x, y) =>
  get(x + 1, y) +
  get(x + 1, y + 1) +
  get(x, y + 1) +
  get(x - 1, y + 1) +
  get(x - 1, y) +
  get(x - 1, y - 1) +
  get(x, y - 1) +
  get(x + 1, y - 1) +
  get(x + 2, y) +
  get(x - 2, y) +
  ((x + y) % 2
    ? get(x + 2, y + 1) + get(x - 2, y + 1) // pointing up
    : get(x + 2, y - 1) + get(x - 2, y - 1)); // pointing down

const step = () => {
  for (let y = 0; y < g1.length; y++) {
    for (let x = 0; x < g1[0].length; x++) {
      const n = getNumLivingNeighbors(x, y);
      g2[y][x] = g1[y][x]
        ? n >= params.minToStayAlive && n <= params.maxToStayAlive
        : n >= params.minForSpawn && n <= params.maxForSpawn;
    }
  }
  [g1, g2] = [g2, g1];
};

reset();

const loop = () => {
  step();
  renderer.render(g1, mouse);

  if (!paused) {
    setTimeout(loop, 1000 / params.speed);
  }
};
loop();

const gui = new window.dat.GUI();
gui.add(params, 'rows', 10, 200, 1).onChange(reset);
gui.add(params, 'speed', 1, 100);
gui.add(params, 'minToStayAlive', 0, 12, 1);
gui.add(params, 'maxToStayAlive', 0, 12, 1);
gui.add(params, 'minForSpawn', 0, 12, 1);
gui.add(params, 'maxForSpawn', 0, 12, 1);
gui.add(
  {
    'Start/Stop': () => {
      paused = !paused;
      if (!paused) loop();
    },
  },
  'Start/Stop'
);
gui.add(
  {
    Step: () => {
      if (paused) loop();
      paused = true;
    },
  },
  'Step'
);
gui.add(
  {
    Clear: () => {
      reset(false);
      paused = true;
    },
  },
  'Clear'
);
gui.add({Randomize: reset}, 'Randomize');

let isAlive;

window.addEventListener('resize', () => renderer.resize(0));
canvas.addEventListener('mousemove', (e) => {
  mouse = renderer.getCoords(e, params.rows);
  if (e.buttons === 1) set(mouse.x, mouse.y, !isAlive);
  renderer.render(g1, mouse);
});
canvas.addEventListener('mousedown', (e) => {
  mouse = renderer.getCoords(e, params.rows);
  isAlive = get(mouse.x, mouse.y);
  set(mouse.x, mouse.y, !isAlive);
  renderer.render(g1, mouse);
});
window.addEventListener('keypress', (e) => {
  if (e.code === 'Space') {
    if (paused) loop();
    paused = true;
  }
});
