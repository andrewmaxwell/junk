const {
  Matter: {Engine, World, Bodies, Body, Composite, Vertices},
  dat: {GUI}
} = window;

const canvas = document.querySelector('canvas');
const T = canvas.getContext('2d');
let width,
  height,
  engine,
  paused,
  lastAdded = 0,
  size;
const params = {rows: 12, spacing: 1.5, cutRate: 1, cutSize: 0.3, gravity: 1};
const options = {friction: 1, frictionStatic: 5};

const reset = () => {
  engine = window.engine = Engine.create({
    positionIterations: 12,
    velocityIterations: 8,
    constraintIterations: 4
  });
  engine.world.gravity.y = params.gravity;
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  paused = false;
  const {rows, spacing} = params;
  size = Math.min(width, height) / (rows + 1);
  const boxes = [
    Bodies.rectangle(width / 2, height, width, size, {
      ...options,
      isStatic: true
    })
  ];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < i; j++) {
      const x = size * (i / 2 - j - 0.5) * spacing + width / 2;
      const y = height - size * (rows - i + 1);
      boxes.push(Bodies.rectangle(x, y, size, size, options));
    }
  }
  World.add(engine.world, boxes);
  render();
};

const render = () => {
  T.clearRect(0, 0, width, height);
  T.beginPath();
  Composite.allBodies(engine.world).forEach(({vertices}) => {
    T.moveTo(vertices[0].x, vertices[0].y);
    vertices.forEach(({x, y}) => T.lineTo(x, y));
    T.lineTo(vertices[0].x, vertices[0].y);
  });
  T.fillStyle = '#EEE';
  T.fill();
  T.stroke();
};

const interpolate = (a, b, s = params.cutSize) => ({
  x: a.x * (1 - s) + b.x * s,
  y: a.y * (1 - s) + b.y * s
});

const getAngle = (A, B, C) => {
  var AB = Math.hypot(B.x - A.x, B.y - A.y);
  var BC = Math.hypot(B.x - C.x, B.y - C.y);
  var AC = Math.hypot(C.x - A.x, C.y - A.y);
  return Math.acos((BC * BC + AB * AB - AC * AC) / (2 * BC * AB));
};

const indexOfMinAngle = v => {
  let index = 0,
    minAngle = Infinity;
  v.forEach((p, i) => {
    const angle = getAngle(
      v[(i - 1 + v.length) % v.length],
      p,
      v[(i + 1) % v.length]
    );
    if (angle < minAngle) {
      minAngle = angle;
      index = i;
    }
  });
  return index;
};

const filterPoints = v =>
  v.length > 3
    ? v.filter((p, i) => {
        const next = v[(i + 1) % v.length];
        return Math.hypot(next.x - p.x, next.y - p.y) > size / 8;
      })
    : v;

const cutCorner = box => {
  const v = box.vertices.map(({x, y}) => ({x, y}));
  const index = indexOfMinAngle(v);
  const newVertices = filterPoints([
    ...v.slice(0, index),
    interpolate(v[index], v[(index - 1 + v.length) % v.length]),
    interpolate(v[index], v[(index + 1) % v.length]),
    ...v.slice(index + 1)
  ]);
  Composite.remove(engine.world, box);
  Composite.add(
    engine.world,
    Body.create({
      position: Vertices.centre(newVertices),
      vertices: newVertices
    })
  );
};

const loop = () => {
  if (!paused) requestAnimationFrame(loop);
  render();
  Engine.update(engine);

  const now = Date.now();
  if (now - lastAdded > 1000 / params.cutRate) {
    lastAdded = now;
    const box =
      engine.world.bodies[
        1 + Math.floor(Math.random() * (engine.world.bodies.length - 1))
      ];
    cutCorner(box);
  }
};

const setOptions = () =>
  Composite.allBodies(engine.world).forEach(b => Body.set(b, options));

const gui = new GUI();
gui
  .add(params, 'rows', 1, 25)
  .step(1)
  .onChange(reset);
gui.add(params, 'spacing', 1, 2).onChange(reset);
gui.add(params, 'cutRate', 0, 10);
gui.add(params, 'cutSize', 0, 0.99);
gui.add(params, 'gravity', 0, 10).onChange(v => (engine.world.gravity.y = v));
gui.add(options, 'friction', 0, 1).onChange(setOptions);
gui.add(options, 'frictionStatic', 0, 10).onChange(setOptions);
gui.add(
  {
    'pause/resume': () => {
      paused = !paused;
      loop();
    }
  },
  'pause/resume'
);
gui.add({'reset simulation': reset}, 'reset simulation');

window.addEventListener('resize', reset);
window.addEventListener('click', ({pageX: x, pageY: y}) => {
  const box = engine.world.bodies.find(b =>
    Vertices.contains(b.vertices, {x, y})
  );
  if (!box) return;
  cutCorner(box);
  render();
});

reset();
loop();
