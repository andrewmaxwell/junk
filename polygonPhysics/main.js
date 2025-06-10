import {viewer} from '../primeSpiral/viewer.js';
import {poly, randPoly, rect} from './helpers.js';
import {World} from './World.js';

const world = new World();

const randomPoly = (x, y) => ({
  points: randPoly(
    x,
    y,
    3 + Math.floor(Math.random() * 8), // numPts
    10, // minRad
    150, // maxRad
  ),
});

for (let i = 0; i < 100; i++) {
  world.add(
    randomPoly((Math.random() - 0.5) * 1000, (Math.random() - 1) * 1500),
    {
      points: poly(
        (Math.random() - 0.5) * 1000, // x
        (Math.random() - 1) * 1500, // y
        10 + Math.random() * 100, // rad
        16, // sides
      ),
    },
    {
      points: rect(
        Math.random() * 1500 - 800, // x
        Math.random() * 1500 - 1500, // y
        10 + Math.random() * 300, // w
        10 + Math.random() * 100, // h
      ),
      xVelocity: Math.random(),
    },
  );
}

world.add(
  {points: rect(-1200, 700, 2400, 100), fixed: true}, // floor
  {points: rect(-1200, -500, 100, 1200), fixed: true}, // left wall
);

/** @import {Shape} from './Shape.js' */
/** @type {Shape | undefined} */
let dragging;

viewer(
  (ctx, _, mouse) => {
    world.step();

    if (dragging) {
      dragging.moveTo(mouse.x, mouse.y);
      dragging.xVelocity = mouse.movementX;
      dragging.yVelocity = mouse.movementY;
    }

    ctx.globalAlpha = 0.5;

    // shapes
    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    for (const s of world.shapes) {
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
        ctx.arc(contact.x, contact.y, Math.sqrt(force) / 8, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  },
  {
    initialView: {zoom: 0.3},
    // onClick: ({x, y}) => world.add(randomPoly(x, y)),
    onClick: () => {
      console.log(world.grid);
    },
    onMouseDown: ({x, y}) => {
      dragging = world.getClosestShape(x, y);
    },
    onMouseUp: () => (dragging = undefined),
  },
);
