const {
  Matter: {Engine, World, Bodies, Body, Composite, Vertices},
  dat: {GUI}
} = window;

const canvas = document.querySelector('canvas');
const T = canvas.getContext('2d');
let width, height, engine;

const params = {rows: 12, spacing: 1.5, cutRate: 1, cutSize: 2 / 3, gravity: 1};

const options = {friction: 1, frictionStatic: 5, slop: 0};

const reset = () => {
  engine = window.engine = Engine.create({
    positionIterations: 12,
    velocityIterations: 8,
    constraintIterations: 4
  });
  engine.world.gravity.y = params.gravity;
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  const {rows, spacing} = params;
  const size = Math.min(width, height) / rows;
  const boxes = [
    Bodies.rectangle(width / 2, height, width, size, {
      ...options,
      isStatic: true
    })
  ];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < i; j++) {
      const x = size * (i / 2 - j - 0.5) * spacing + width / 2;
      const y = height - size * (rows - i);
      boxes.push(Bodies.rectangle(x, y, size, size, options));
    }
  }
  World.add(engine.world, boxes);
};

const renderLoop = () => {
  requestAnimationFrame(renderLoop);
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
  Engine.update(engine);
};

const interpolate = (a, b, s = params.cutSize) => ({
  x: a.x * (1 - s) + b.x * s,
  y: a.y * (1 - s) + b.y * s
});

const cutLoop = () => {
  const w = engine.world;
  const box = w.bodies[1 + Math.floor(Math.random() * (w.bodies.length - 1))];
  const v = box.vertices.map(({x, y}) => ({x, y}));
  const index = Math.floor(Math.random() * v.length);
  const newVertices = [
    ...v.slice(0, index),
    interpolate(v[index], v[(index - 1 + v.length) % v.length]),
    interpolate(v[index], v[(index + 1) % v.length]),
    ...v.slice(index + 1)
  ];
  Composite.remove(w, box);
  Composite.add(
    w,
    Body.create({
      position: Vertices.centre(newVertices),
      vertices: newVertices
    })
  );
  setTimeout(cutLoop, 1000 / params.cutRate);
};

const setOptions = () =>
  Composite.allBodies(engine.world).forEach(b => Body.set(b, options));

const gui = new GUI();
gui
  .add(params, 'rows', 1, 50)
  .step(1)
  .onChange(reset);
gui.add(params, 'spacing', 1, 2).onChange(reset);
gui.add(params, 'cutRate', 1, 10);
gui.add(params, 'cutSize', 0, 0.99);
gui.add(params, 'gravity', 0, 10).onChange(v => (engine.world.gravity.y = v));
gui.add(options, 'friction', 0, 1).onChange(setOptions);
gui.add(options, 'frictionStatic', 0, 10).onChange(setOptions);
gui.add({'reset simulation': reset}, 'reset simulation');

window.addEventListener('resize', reset);

reset();
renderLoop();
cutLoop();
