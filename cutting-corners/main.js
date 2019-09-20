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
  size,
  cuts;
const params = {
  rows: 8,
  spacing: 1.5,
  cutRate: 1,
  cutSize: 0.3,
  gravity: 1,
  keepCuts: true
};
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
  size = Math.min(width / spacing, height) / (rows + 1);
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
  cuts = 0;
  render();
};

const render = () => {
  T.clearRect(0, 0, width, height);
  T.beginPath();
  engine.world.bodies.forEach(({vertices}) => {
    T.moveTo(vertices[0].x, vertices[0].y);
    vertices.forEach(({x, y}) => T.lineTo(x, y));
    T.lineTo(vertices[0].x, vertices[0].y);
  });
  T.fillStyle = '#EEE';
  T.fill();
  T.stroke();

  T.fillStyle = 'black';
  T.font = '18px sans-serif';
  T.fillText(`Cuts: ${cuts}`, 5, height - 5);
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

const filterPoints = v => {
  if (v.length < 4) return v;
  const filtered = v.filter((p, i) => {
    const next = v[(i + 1) % v.length];
    return Math.hypot(next.x - p.x, next.y - p.y) > size / 8;
  });
  return filtered.length > 2 ? filtered : v;
};

const cutCorner = box => {
  const v = box.vertices.map(({x, y}) => ({x, y}));
  if (v.length < 4) return;
  const index = indexOfMinAngle(v);
  const v1 = interpolate(v[index], v[(index - 1 + v.length) % v.length]);
  const v2 = interpolate(v[index], v[(index + 1) % v.length]);
  const newVertices = filterPoints([
    ...v.slice(0, index),
    v1,
    v2,
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
  if (params.keepCuts) {
    const pieceVertices = [v1, v[index], v2];
    const piece = Body.create({
      position: Vertices.centre(pieceVertices),
      vertices: pieceVertices
    });
    Composite.add(engine.world, piece);
  }
  cuts++;
};

const loop = () => {
  if (!paused) requestAnimationFrame(loop);
  render();
  Engine.update(engine);

  const now = Date.now();
  if (now - lastAdded > 1000 / params.cutRate) {
    lastAdded = now;
    const boxes = engine.world.bodies.filter(
      (b, i) => i && b.vertices.length > 3
    );
    const box = boxes[Math.floor(Math.random() * boxes.length)];
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
gui.add(params, 'keepCuts');
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
window.addEventListener('keypress', e => {
  if (e.key === 'r') reset();
  if (e.key === 'm') {
    const body = Bodies.circle(-width, 0, size * 2, {density: 1});
    Body.setVelocity(body, {x: 40 + Math.random() * 50, y: 0});
    Composite.add(engine.world, body);
  }
});

reset();
loop();
