import {projection} from '../wave/projection.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
  }
  render(grid, {cameraDistance, angX, angZ, cameraZoom, cellRad}, colors) {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
    const ctx = this.canvas.getContext('2d');

    ctx.translate(innerWidth / 2, innerHeight / 2);

    const project = projection(
      cameraDistance * Math.cos(angX) * Math.sin(angZ), // camera x
      cameraDistance * Math.sin(angX) * Math.sin(angZ), // camera y
      cameraDistance * Math.cos(angZ), // camera z
      Math.PI - angZ, // camera rotation x
      0, // camera rotation y
      (3 * Math.PI) / 2 - angX, // camera rotation z
      0, // camera pointed at x
      0, // camera pointed at y
      cameraZoom
    );

    const points = Object.entries(grid)
      .map(([key, val]) => {
        const [x, y, z] = key.split(',');
        return {...project(+x, +y, +z), val};
      })
      .sort((a, b) => b.z - a.z);

    for (const {x, y, z, val} of points) {
      if (z <= 0) continue;
      ctx.fillStyle = colors[val].color;
      ctx.beginPath();
      ctx.arc(x, y, (cameraZoom * cellRad) / z, 0, 2 * Math.PI);
      ctx.fill();
    }

    // axis lines
    const len = 50;
    const center = project(0, 0, 0);
    const up = project(0, len, 0);
    const right = project(len, 0, 0);
    const forward = project(0, 0, len);
    const line = (color, to) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    };

    line('green', up);
    line('red', right);
    line('blue', forward);
  }
}
