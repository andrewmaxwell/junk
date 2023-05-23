import {projection} from '../wave/projection.js';

const projectCoords = (world, params) => {
  const project = projection(
    params.cameraDistance * Math.cos(params.angX) * Math.sin(params.angZ), // camera x
    params.cameraDistance * Math.sin(params.angX) * Math.sin(params.angZ), // camera y
    params.cameraDistance * Math.cos(params.angZ), // camera z
    Math.PI - params.angZ, // camera rotation x
    0, // camera rotation y
    (3 * Math.PI) / 2 - params.angX, // camera rotation z
    0, // camera pointed at x
    0, // camera pointed at y
    params.cameraZoom
  );

  for (const p of world.points) {
    p.coords = project(p.x, p.y, p.z);
  }
};

const toOpacity = (z, params) =>
  Math.max(0, Math.min(1, 1 - z / params.opacity / params.cameraDistance));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
  }
  render(world, params) {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
    const ctx = this.canvas.getContext('2d');

    ctx.translate(innerWidth / 2, innerHeight / 2);

    projectCoords(world, params);

    // ctx.strokeStyle = 'green';
    for (const {a, b, len} of world.constraints) {
      // const diff = 1 - Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / len;
      // ctx.lineWidth = diff ** 2;
      // ctx.strokeStyle = diff > 0 ? '#00F' : '#FF0';

      if (len > params.maxLineLength || a.coords.z <= 0 || b.coords.z <= 0)
        continue;

      const g = ctx.createLinearGradient(
        a.coords.x,
        a.coords.y,
        b.coords.x,
        b.coords.y
      );
      g.addColorStop(0, `rgba(0,255,0,${toOpacity(b.coords.z, params)})`);
      g.addColorStop(1, `rgba(0,255,0,${toOpacity(a.coords.z, params)})`);
      ctx.fillStyle = g;
      const angle = Math.atan2(
        b.coords.y - a.coords.y,
        b.coords.x - a.coords.x
      );
      ctx.beginPath();
      ctx.arc(
        a.coords.x,
        a.coords.y,
        (params.lineThickness * params.cameraDistance) / a.coords.z,
        angle + Math.PI * 0.5,
        angle + Math.PI * 1.5
      );
      ctx.arc(
        b.coords.x,
        b.coords.y,
        (params.lineThickness * params.cameraDistance) / b.coords.z,
        angle + Math.PI * 1.5,
        angle + Math.PI * 2.5
      );
      ctx.fill();
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    for (const {name, coords} of world.points) {
      const {x, y, z} = coords;
      if (z <= 0) continue;
      ctx.globalAlpha = toOpacity(z / 2, params);
      ctx.font = `${
        (params.fontSize * params.cameraDistance) / z
      }px sans-serif`;
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  }
}
