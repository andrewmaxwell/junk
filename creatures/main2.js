const {
  Body,
  Engine,
  Render,
  Constraint,
  MouseConstraint,
  Mouse,
  World,
  Bodies,
  Events
} = window.Matter;

const width = 1400;
const height = 600;

// const maxChildren = 4;
const minLength = 30;
const maxLength = 300;
const boardWidth = 10;

const roundLength = 10_000;
const popSize = 1;
const mutationRate = 0.05;

let creatures = [];

const engine = (window.engine = Engine.create());

const render = (window.render = Render.create({
  element: document.body,
  engine,
  options: {width, height}
}));

Render.run(render);
Engine.run(engine);

const mouse = Mouse.create(render.canvas),
  mouseConstraint = MouseConstraint.create(engine, {
    mouse,
    constraint: {angularStiffness: 0, render: {visible: false}}
  });
World.add(engine.world, mouseConstraint);
render.mouse = mouse;

Events.on(engine, 'beforeUpdate', () => setMuscles(engine));
Events.on(render, 'beforeRender', () => {
  const maxX =
    Math.max(...engine.world.bodies.map(m => m.position.x)) + maxLength;
  Render.lookAt(render, {
    min: {x: maxX - width, y: 0},
    max: {x: maxX, y: height}
  });
});

const bodyOptions = {collisionFilter: {group: -1}};
const constraintOptions = {render: {lineWidth: 0.25}};
const getLength = ob => minLength + (maxLength - minLength) * ob.pieceLength;

const generateRandom = (depth = 2) => ({
  pieceLength: Math.random(),
  attachPt: Math.random(),
  offset: Math.random(),
  range: Math.random(),
  min: Math.random(),
  children: Array(depth)
    .fill()
    .map(() => generateRandom(depth - 1))
});

const create = (world, ob, parent) => {
  ob._body = Bodies.rectangle(
    width / 2 - Math.random() * 100,
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
  ob.children.forEach(ch => create(world, ch, ob));
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
    const rangePad = (maxLen - minLen) * 0.95;
    // const range = m.range * (maxLen - minLen);
    m._muscle.length =
      minLenPad +
      rangePad *
        // m.min * (maxLen - range) +
        // range *
        (Math.sin(m.offset * Math.PI * 2 + now / 1000) * 0.5 + 0.5);
  });

  // if (now > roundLength) nextRound();
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
    : Math.random() < 0.5
    ? a
    : b;

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
  engine.world.bodies.length = 0;
  engine.world.constraints.length = 0;

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

  creatures.forEach(c => create(engine.world, c));

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
    .slice(0, 4);
  console.log('winners', winners);

  reset(winners);
};

reset();

window.onkeypress = nextRound;
