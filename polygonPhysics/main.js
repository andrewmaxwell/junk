import {viewer} from '../primeSpiral/viewer.js';
import {poly, rect} from './helpers.js';
import {World} from './World.js';

const world = new World();

for (let i = 0; i < 50; i++) {
  world.add(
    {
      points: poly(
        (Math.random() - 0.5) * 1000, // x
        (Math.random() - 1) * 1500, // y
        10 + Math.random() * 100, // rad
        Math.floor(3 + Math.random() * 10), // sides
      ),
    },
    {
      points: rect(
        Math.random() * 1500 - 800,
        Math.random() * 1500 - 1500,
        10 + Math.random() * 300,
        10 + Math.random() * 100,
      ),
      vx: Math.random(),
    },
  );
}

world.add(
  {points: rect(-800, 700, 1500, 200), fixed: true}, // floor
  {points: rect(-1200, -500, 199, 1200), fixed: true}, // left wall
);

viewer(
  (ctx) => {
    world.step();

    // shapes
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeStyle = 'white';
    ctx.beginPath();
    for (const {points: p} of world.shapes) {
      ctx.moveTo(p[p.length - 1].x, p[p.length - 1].y);
      p.forEach((p) => ctx.lineTo(p.x, p.y));
    }
    ctx.stroke();
    ctx.fill();

    // bounding boxes
    // ctx.strokeStyle = 'green';
    // for (const {boundingBox: b} of world.shapes) {
    //   ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    // }

    // contact points
    ctx.fillStyle = 'cyan';
    for (const s of world.shapes) {
      for (const c of s.contacts) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // ctx.strokeStyle = 'red';
    // ctx.beginPath();
    // for (const [a, b] of world.pairs) {
    //   ctx.moveTo(a.centroid.x, a.centroid.y);
    //   ctx.lineTo(b.centroid.x, b.centroid.y);
    // }
    // ctx.stroke();
  },
  {initialView: {zoom: 0.5}},
);
