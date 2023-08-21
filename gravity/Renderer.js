export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
  }
  render(bodies) {
    const {canvas} = this;
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth;
    canvas.height = innerHeight;

    // bodies
    ctx.strokeStyle = 'white';
    ctx.beginPath();
    for (const {x, y, rad} of bodies) {
      ctx.moveTo(x + rad, y);
      ctx.arc(x, y, rad, 0, 2 * Math.PI);
    }
    ctx.stroke();

    // speed lines
    ctx.beginPath();
    for (const {x, y, xs, ys} of bodies) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + xs, y + ys);

      ctx.save();
      ctx.translate(x + xs, y + ys);
      ctx.rotate(Math.atan2(ys, xs));
      ctx.lineTo(-8, -4);
      ctx.lineTo(-8, 4);
      ctx.lineTo(0, 0);
      ctx.restore();
    }
    ctx.stroke();

    // paths
    for (let i = 0; i < bodies.length; i++) {
      // ctx.strokeStyle = `hsla(${180 + i * 30}, 100%, 50%, 0.5)`;
      // ctx.beginPath();
      // for (const {x, y} of bodies[i].path) ctx.lineTo(x, y);
      // ctx.stroke();

      ctx.strokeStyle = `hsla(${180 + i * 30}, 100%, 50%, 0.05)`;
      for (const {x, y} of bodies[i].path) {
        ctx.beginPath();
        ctx.arc(x, y, bodies[i].rad, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  }
}
