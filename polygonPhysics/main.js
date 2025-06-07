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
  {points: rect(-1200, 700, 2400, 100), fixed: true}, // floor
  {points: rect(-1200, -500, 100, 1200), fixed: true}, // left wall
);

viewer(
  (ctx) => {
    world.step();

    ctx.globalAlpha = 0.5;

    // shapes
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeStyle = 'white';
    ctx.beginPath();
    for (const {points: p} of world.shapes) {
      ctx.moveTo(p[p.length - 1].x, p[p.length - 1].y);
      p.forEach((p) => ctx.lineTo(p.x, p.y));
    }
    ctx.stroke();
    ctx.fill();

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
  {initialView: {zoom: 0.5}},
);
