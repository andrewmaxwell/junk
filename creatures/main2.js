import {Renderer} from './Renderer.js';

const {
  Bodies,
  Body,
  Composite,
  Constraint,
  Engine,
  Events,
  World
} = window.Matter;

const width = window.innerWidth;
const height = window.innerHeight;

// const maxChildren = 4;
const minLength = 30;
const maxLength = 300;
const boardWidth = 10;

const complexity = 2;
const roundLength = 30_000;
const popSize = 30;
const numWinners = 4;
const mutationRate = 0.05;
const muscleSpeed = 0.001;

let creatures = [],
  roundStart;

const renderer = new Renderer(document.querySelector('#C'), width, height);
const engine = (window.engine = Engine.create());

const bodyOptions = {collisionFilter: {group: -1}};
const constraintOptions = {render: {lineWidth: 0.25, anchors: false}};
const getLength = ob => minLength + (maxLength - minLength) * ob.pieceLength;

const generateRandom = (depth = complexity) => ({
  pieceLength: Math.random(),
  attachPt: Math.random(),
  offset: Math.random(),
  range: Math.random(),
  min: Math.random(),
  children: Array(depth)
    .fill()
    .map(() => generateRandom(depth - 1))
});

const create = (world, ob, parent, depth = 0) => {
  ob._body = Bodies.rectangle(
    depth,
    height / 2,
    boardWidth,
    getLength(ob),
    bodyOptions
  );
  if (parent) {
    ob._parent = parent;
    ob._muscle = Constraint.create({
      bodyA: ob._body,
      bodyB: parent._body,
      pointA: {x: 0, y: getLength(ob) / 2},
      pointB: {
        x: 0,
        y: (getLength(parent) / 2) * (ob.attachPt < 0.5 ? 1 : -1)
      },
      ...constraintOptions
    });
    ob._joint = Constraint.create({
      bodyA: ob._body,
      bodyB: parent._body,
      length: 0,
      pointA: {x: 0, y: -getLength(ob) / 2},
      pointB: {x: 0, y: (ob.attachPt - 0.5) * getLength(parent)},
      ...constraintOptions
    });
    World.add(world, [ob._joint, ob._muscle]);
  }
  ob.children.forEach(ch => create(world, ch, ob, depth + 1));
  World.add(world, ob._body);
};

const flatten = ob => [ob, ...ob.children.flatMap(flatten)];

const setMuscles = engine => {
  const now = engine.timing.timestamp;
  creatures.flatMap(flatten).forEach(m => {
    if (!m._parent) return;
    const minLen = Math.abs(
      getLength(m._parent) * Math.max(m.attachPt, 1 - m.attachPt) - getLength(m)
    );
    const maxLen =
      getLength(m) +
      getLength(m._parent) * Math.max(m.attachPt, 1 - m.attachPt);
    const minLenPad = minLen + (maxLen - minLen) * 0.01;
    const rangePad = m.range * (maxLen - minLen) * 0.95;
    m._muscle.length =
      minLenPad +
      m.min * (maxLen - rangePad - minLenPad) +
      rangePad *
        (Math.sin(m.offset * Math.PI * 2 + now * muscleSpeed) * 0.5 + 0.5);
  });

  if (now > roundStart + roundLength) nextRound();
};

const combine = (a, b) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.map((el, i) => combine(el, b[i]))
    : a && typeof a === 'object' && b && typeof b === 'object'
    ? Object.keys(a).reduce((res, key) => {
        if (key[0] !== '_') res[key] = combine(a[key], b[key]);
        return res;
      }, {})
    : Math.random() < mutationRate
    ? Math.random()
    : a + Math.random() * (b - a);

const generateChild = parents => {
  if (parents.length < 2) return parents[0];
  const firstIndex = Math.floor(Math.random() * parents.length);
  let secondIndex;
  do {
    secondIndex = Math.floor(Math.random() * parents.length);
  } while (secondIndex === firstIndex);
  return combine(parents[firstIndex], parents[secondIndex]);
};

const reset = winners => {
  Engine.clear(engine);
  World.clear(engine.world);
  roundStart = engine.timing.timestamp;

  World.add(
    engine.world,
    Bodies.rectangle(width / 2, height + 50, width * 10, 100, {
      isStatic: true,
      friction: 1
    })
  );

  creatures = [];
  if (winners) {
    for (let i = 0; i < popSize - winners.length; i++) {
      creatures[i] = generateChild(winners);
    }
    creatures.push(...winners);
  } else {
    for (let i = 0; i < popSize; i++) {
      creatures[i] = generateRandom();
    }
  }

  creatures.forEach((c, i) => {
    c.index = i;
    create(engine.world, c);
  });

  setMuscles(engine);
  Engine.update(engine);
  engine.world.bodies.forEach(b => {
    Body.setAngularVelocity(b, 0);
    Body.setVelocity(b, {x: 0, y: 0});
  });
};

const nextRound = () => {
  const winners = creatures
    .sort((a, b) => b._body.position.x - a._body.position.x)
    .slice(0, numWinners);
  console.log(
    'winners',
    winners,
    winners.map(w => Math.round(w._body.position.x))
  );

  reset(winners);
};

reset();

window.onkeypress = nextRound;

Engine.run(engine);

Events.on(engine, 'beforeUpdate', () => {
  setMuscles(engine);
  creatures.sort((a, b) => a._body.position.x - b._body.position.x);
  renderer.render(creatures, engine.world.bodies, maxLength, numWinners);
});
