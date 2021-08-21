import {Simulator} from './Simulator.js';
import {Renderer} from './Renderer.js';
import {interpolate, indexOfMinAngle, filterPoints} from './utils.js';

const sim = new Simulator();
const renderer = new Renderer(document.querySelector('canvas'));

let size,
  paused,
  lastAdded = 0,
  numCuts;

const params = {
  rows: 8,
  spacing: 1.5,
  cutRate: 1,
  cutSize: 0.3,
  gravity: 1,
  keepCuts: true,
  bodyOptions: {
    friction: 1,
    frictionStatic: 5,
    frictionAir: 0,
    restitution: 0.5,
  },
};

const reset = () => {
  renderer.resize();
  sim.reset();

  const width = window.innerWidth;
  const height = window.innerHeight;
  const {spacing, rows, gravity, bodyOptions} = params;
  paused = false;
  numCuts = 0;
  size = Math.min(width / spacing, height) / (rows + 1);
  sim.setGravity(gravity);
  sim.addRectangle(width / 2, height, width, size, {
    ...bodyOptions,
    isStatic: true,
  });
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < i; j++) {
      const x = size * (i / 2 - j - 0.5) * spacing + width / 2;
      const y = height - size * (rows - i + 1);
      sim.addRectangle(x, y, size, size, bodyOptions);
    }
  }
  renderer.render(sim.getBodies(), numCuts);
};

const cutCorner = (box) => {
  const vertices = box.vertices.map(({x, y}) => ({x, y}));
  if (vertices.length < 4) return;
  const index = indexOfMinAngle(vertices);
  const v1 = interpolate(
    vertices[index],
    vertices[(index - 1 + vertices.length) % vertices.length],
    params.cutSize
  );
  const v2 = interpolate(
    vertices[index],
    vertices[(index + 1) % vertices.length],
    params.cutSize
  );
  sim.removeBody(box);
  sim.addShape(
    filterPoints(
      [...vertices.slice(0, index), v1, v2, ...vertices.slice(index + 1)],
      4
    ),
    params.bodyOptions
  );
  if (params.keepCuts)
    sim.addShape([v1, vertices[index], v2], params.bodyOptions);
  numCuts++;
};

const loop = () => {
  if (!paused) requestAnimationFrame(loop);
  sim.step();
  renderer.render(sim.getBodies(), numCuts);

  const now = Date.now();
  if (now - lastAdded > 1000 / params.cutRate) {
    lastAdded = now;
    const boxes = sim.getBodies().filter((b, i) => i && b.vertices.length > 3);
    const box = boxes[Math.floor(Math.random() * boxes.length)];
    cutCorner(box);
  }
};

const gui = new window.dat.GUI();
const f1 = gui.addFolder('Initial Settings');
f1.add(params, 'rows', 1, 25).step(1).onChange(reset);
f1.add(params, 'spacing', 1, 2).onChange(reset);
f1.open();

const f2 = gui.addFolder('Cutting Settings');
f2.add(params, 'cutRate', 0, 10);
f2.add(params, 'cutSize', 0, 0.99);
f2.add(params, 'keepCuts');
f2.open();

const f3 = gui.addFolder('Simulator Settings');
f3.add(params, 'gravity', 0, 10).onChange((v) => sim.setGravity(v));

const setOptions = () => sim.setBodyOptions(params.bodyOptions);
f3.add(params.bodyOptions, 'friction', 0, 1).onChange(setOptions);
f3.add(params.bodyOptions, 'frictionStatic', 0, 10).onChange(setOptions);
f3.add(params.bodyOptions, 'restitution', 0, 1).onChange(setOptions);
f3.open();

gui.add(
  {
    'pause/resume': () => {
      paused = !paused;
      if (!paused) loop();
    },
  },
  'pause/resume'
);
gui.add({'reset simulation': reset}, 'reset simulation');

const mousedown = ({pageX: x, pageY: y}) => {
  const box = sim.bodyAt(x, y);
  if (box) {
    cutCorner(box);
    renderer.render(sim.getBodies(), numCuts);
  }
};

const keypress = (e) => {
  if (e.key === 'r') reset();
  if (e.key === 'm') {
    const management = sim.addCircle(
      -window.innerWidth,
      0,
      128,
      params.options
    );
    sim.setVelocity(management, 30 + Math.random() * 50, 0);
  }
};

const handlers = {resize: reset, mousedown, touchstart: mousedown, keypress};
for (const e in handlers) window.addEventListener(e, handlers[e]);

reset();
loop();
