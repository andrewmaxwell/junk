import {viewer} from '../primeSpiral/viewer.js';
import {poly, randPoly, rect, rgbGradient, rotate} from './helpers.js';
import {drawStats, Stat, timeFunc} from './Stats.js';
import {World} from './World.js';
/** @import {Shape} from './Shape.js' */

const params = {
  gravity: 0.001,
  restitution: 0.2,
  friction: 0.5,
};

/** @type {World} */
let world;

/** @type {Shape | undefined} */
let dragging;

const getColor = rgbGradient([
  [255, 255, 255],
  [255, 0, 0],
  [0, 0, 0],
]);

let lastRenderTime = 0;
let frame = 0;

function reset() {
  world = new World();

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

function step() {
  if (frame % 4 === 0) world.add({points: randShape()});

  const startTime = performance.now();
  const dt = Math.min(30, startTime - lastRenderTime);
  lastRenderTime = startTime;

  world.step(dt, params);
}

/** @param {CanvasRenderingContext2D} ctx */
function draw(ctx) {
  ctx.globalAlpha = 0.5;

  // shapes
  ctx.strokeStyle = 'white';
  for (const s of world.shapes) {
    ctx.fillStyle = s.fixed ? 'black' : getColor(s.totalForce / 200);
    ctx.beginPath();
    s.points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }

  // contact points
  ctx.fillStyle = 'cyan';
  for (const s of world.shapes) {
    for (const {contact, force} of s.contacts) {
      ctx.beginPath();
      ctx.arc(contact.x, contact.y, Math.sqrt(force) / 4, 0, 2 * Math.PI);
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

viewer(
  (ctx, _, mouse) => {
    if (dragging) {
      dragging.moveTo(mouse.x, mouse.y);
      dragging.xVelocity = mouse.movementX;
      dragging.yVelocity = mouse.movementY;
    }

    simStat.push(timeFunc(step));
    drawStat.push(timeFunc(() => draw(ctx)));
    simStat.syncMax(drawStat);

    overlapStat.push(world.pairs.length);
    collisionStat.push(world.numCollisions / world.collisionIterations);
    overlapStat.syncMax(collisionStat);

    shapeStat.push(world.shapes.length);

    frame++;
  },
  {
    initialView: {zoom: 0.5},
    onMouseDown: ({x, y}) => {
      dragging = world.getClosestShape(x, y);
    },
    onMouseUp: () => (dragging = undefined),
    drawStatic: (ctx) =>
      drawStats(ctx, simStat, drawStat, overlapStat, collisionStat, shapeStat),
  },
);

// @ts-expect-error lil
const gui = new window.lil.GUI();
gui.add(params, 'gravity', -0.01, 0.01);
gui.add(params, 'restitution', 0, 1);
gui.add(params, 'friction', 0, 2);
gui.add({reset}, 'reset');
gui.close();
