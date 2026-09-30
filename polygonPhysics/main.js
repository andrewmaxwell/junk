import {viewer} from '../primeSpiral/viewer.js';
import {
  getThrowVelocity,
  poly,
  randPoly,
  rect,
  rgbGradient,
  rotate,
} from './helpers.js';
import {drawStats, Stat, timeFunc} from './Stats.js';
import {World} from './World.js';
/** @import {Shape} from './Shape.js' */

const params = {
  gravity: 0.001,
  restitution: 0.2,
  friction: 0.2, // matches the old solver's feel, which under-applied friction
};

/** @type {World} */
let world;

/** @type {Shape | undefined} */
let dragging;

/** @type {Array<{t: number, x: number, y: number}>} recent mouse positions while dragging */
let dragHistory = [];

const getColor = rgbGradient([
  [255, 255, 255],
  [255, 0, 0],
  [0, 0, 0],
]);

// same gradient with a cool tint, for sleeping shapes
const getSleepingColor = rgbGradient([
  [200, 215, 255],
  [210, 0, 70],
  [0, 0, 40],
]);

const STEP_MS = 1000 / 120; // fixed timestep, so results don't depend on frame rate
const MAX_STEPS_PER_FRAME = 4; // if the sim can't keep up, slow down instead of spiraling
let lastRenderTime = performance.now();
let accumulator = 0;
let stepCount = 0;

function reset() {
  world = new World();
  dragging = undefined;

  // floor
  // world.add({points: rect(0, 400, 2000, 100), fixed: true});

  // bowl
  // world.add(...bowl(1000).map((points) => ({points, fixed: true})));

  // ramps
  const x = -300;
  const w = 1000;
  const h = 50;
  const a = 0.4;
  const hSpace = 400;
  const vSpace = 800;
  [...Array(6).keys()]
    .flatMap((_, i) => [
      rotate(rect(-hSpace, x + vSpace * i, w, h), a),
      rotate(rect(hSpace, x + vSpace * (i + 0.5), w, h), -a),
    ])
    .forEach((points) => world.add({points, fixed: true}));
}

const randShape = () => {
  const x = -300;
  const y = -3000;
  const r = Math.floor(Math.random() * 3);
  if (r === 0) return randPoly(x, y, 6 + Math.floor(Math.random() * 8), 3, 50);
  if (r === 1) return poly(x, y, 15 + Math.random() * 25, 16);
  return rect(x, y, 20 + Math.random() * 30, 20 + Math.random() * 200);
};

/** @param {{x: number, y: number}} mouse */
function step(mouse) {
  if (stepCount++ % 8 === 0) world.add({points: randShape()}); // 15 per second

  if (dragging) {
    // pick the velocity that lands the shape on the mouse after this step,
    // so it collides along the way (the throw velocity is set on mouse up)
    dragging.wake();
    dragging.xVelocity = (mouse.x - dragging.centroidX) / STEP_MS;
    dragging.yVelocity = (mouse.y - dragging.centroidY) / STEP_MS;
  }

  world.step(STEP_MS, params);
}

/** @param {CanvasRenderingContext2D} ctx */
function draw(ctx) {
  ctx.globalAlpha = 0.5;

  // shapes
  ctx.strokeStyle = 'white';
  for (const s of world.shapes) {
    const color = s.awake ? getColor : getSleepingColor;
    ctx.fillStyle = s.fixed ? 'black' : color(s.totalForce / 7);
    ctx.beginPath();
    s.points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }

  // contact points
  ctx.fillStyle = 'cyan';
  for (const {contacts} of world.manifolds.values()) {
    for (const {x, y, jn} of contacts) {
      ctx.beginPath();
      ctx.arc(x, y, Math.sqrt(jn / STEP_MS) / 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}

reset();

const simStat = new Stat('ms to simulate', 'red');
const drawStat = new Stat('ms to render', 'cyan');
const overlapStat = new Stat('BB overlaps', 'lime');
const collisionStat = new Stat('collisions', 'yellow');
const shapeStat = new Stat('shapes', 'magenta');
const awakeStat = new Stat('awake', 'orange');

viewer(
  (ctx, _, mouse) => {
    const now = performance.now();
    accumulator = Math.min(
      accumulator + now - lastRenderTime,
      MAX_STEPS_PER_FRAME * STEP_MS,
    );
    lastRenderTime = now;

    if (dragging) {
      dragHistory.push({t: now, x: mouse.x, y: mouse.y});
      while (now - dragHistory[0].t > 200) dragHistory.shift();
    }

    simStat.push(
      timeFunc(() => {
        for (; accumulator >= STEP_MS; accumulator -= STEP_MS) step(mouse);
      }),
    );
    drawStat.push(timeFunc(() => draw(ctx)));
    simStat.syncMax(drawStat);

    overlapStat.push(world.pairs.length);
    collisionStat.push(world.manifolds.size);
    overlapStat.syncMax(collisionStat);

    shapeStat.push(world.shapes.length);
    awakeStat.push(world.shapes.filter((s) => s.awake).length);
    shapeStat.syncMax(awakeStat);
  },
  {
    initialView: {zoom: 0.5},
    onMouseDown: ({x, y}) => {
      dragging = world.getClosestShape(x, y);
    },
    onMouseUp: () => {
      if (dragging) {
        const v = getThrowVelocity(dragHistory, performance.now());
        dragging.xVelocity = v.x;
        dragging.yVelocity = v.y;
      }
      dragging = undefined;
      dragHistory = [];
    },
    drawStatic: (ctx) =>
      drawStats(
        ctx,
        simStat,
        drawStat,
        overlapStat,
        collisionStat,
        shapeStat,
        awakeStat,
      ),
  },
);

// @ts-expect-error lil
const gui = new window.lil.GUI();
gui.add(params, 'gravity', -0.01, 0.01).onChange(() => world.wakeAll());
gui.add(params, 'restitution', 0, 1);
gui.add(params, 'friction', 0, 2);
gui.add({reset}, 'reset');
gui.close();
