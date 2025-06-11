import {viewer} from '../primeSpiral/viewer.js';
import {poly, randPoly, rect, rgbGradient} from './helpers.js';
import {World} from './World.js';

const world = new World();

for (let i = 0; i < 100; i++) {
  const y = (Math.random() - 1) * 8000;
  world.add(
    {points: randPoly(0, y, 6 + Math.floor(Math.random() * 8), 10, 150)},
    {points: poly(0, y, 30 + Math.random() * 100, 16)},
    {points: rect(0, y, 30 + Math.random() * 100, 30 + Math.random() * 500)},
  );
}

// floor
// world.add({points: rect(0, 750, 2000, 100), fixed: true});

// bowl
const num = 16;
const rad = 2000;
const bottom = rad / 2 + 100;
for (let i = 0; i < num; i++) {
  const angle1 = Math.PI * (1 - i / (num - 1));
  const angle2 = Math.PI * (1 - (i + 1) / (num - 1));
  const left = rad * Math.cos(angle1);
  const right = rad * Math.cos(angle2);
  if (right - left < 50) continue;
  const topLeft = rad * (Math.sin(angle1) - 0.5);
  const topRight = rad * (Math.sin(angle2) - 0.5);
  world.add({
    points: [
      {x: left, y: topLeft},
      {x: right, y: topRight},
      {x: right, y: bottom},
      {x: left, y: bottom},
    ],
    fixed: true,
  });
}

/** @import {Shape} from './Shape.js' */
/** @type {Shape | undefined} */
let dragging;

const getColor = rgbGradient([
  [255, 255, 255],
  [255, 0, 0],
  [0, 0, 0],
]);

const times = [];
let lastRenderTime = 0;
let frame = 0;

viewer(
  (ctx, _, mouse) => {
    const startTime = performance.now();
    const dt = Math.min(30, startTime - lastRenderTime);
    lastRenderTime = startTime;

    world.step(dt);

    if (dragging) {
      dragging.moveTo(mouse.x, mouse.y);
      dragging.xVelocity = mouse.movementX;
      dragging.yVelocity = mouse.movementY;
    }

    ctx.globalAlpha = 0.5;

    // shapes
    ctx.strokeStyle = 'white';
    for (const s of world.shapes) {
      ctx.fillStyle = getColor(s.totalForce / 2000);
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

    // pairs
    // ctx.strokeStyle = 'red';
    // ctx.beginPath();
    // for (const [a, b] of world.pairs) {
    //   ctx.moveTo(a.centroidX, a.centroidY);
    //   ctx.lineTo(b.centroidX, b.centroidY);
    // }
    // ctx.stroke();

    times[frame++ % 256] = performance.now() - startTime;
  },
  {
    initialView: {zoom: 0.2},
    onMouseDown: ({x, y}) => {
      dragging = world.getClosestShape(x, y);
    },
    onMouseUp: () => (dragging = undefined),
    drawStatic: (ctx) => {
      ctx.fillStyle = 'white';
      const avg = times.reduce((a, b) => a + b) / times.length;
      ctx.fillText(avg.toFixed(2) + ' ms', 3, 12);
    },
  },
);
