import {viewer} from '../primeSpiral/viewer.js';
import {AU_KM, CELESTIAL_BODIES, DAY_MS} from './celestialBodies.js';

const start = Date.now();
const pastPoints = 4096;

let frame = 0;

viewer(
  (ctx, camera) => {
    const time = start + frame * DAY_MS;

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1 / camera.zoom;
    for (const b of CELESTIAL_BODIES) {
      ctx.beginPath();
      for (let i = 0; i < pastPoints; i++) {
        const {x, y} = b.positionAt(time - (i / pastPoints) * 365 * DAY_MS);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (const b of CELESTIAL_BODIES) {
      const {x, y} = b.positionAt(time);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(x, y, b.radius_km / AU_KM, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.fillStyle = 'white';
    ctx.font = '16px monospace';
    for (const b of CELESTIAL_BODIES) {
      const {x, y} = b.positionAt(time);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1 / camera.zoom, 1 / camera.zoom);
      ctx.translate(-x, -y);
      ctx.fillText(b.name, x, y);
      ctx.restore();
    }

    frame++;
    console.log(camera.zoom);
  },
  {initialView: {zoom: 67}},
);
