export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
  }
  resize() {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
  }
  render({balls, blocks, links}, ms) {
    const ctx = this.canvas.getContext('2d');

    const start = performance.now();

    ctx.clearRect(0, 0, innerWidth, innerHeight);

    ctx.fillStyle = 'gray';
    for (const {x, y, w, h} of blocks) {
      ctx.fillRect(x, y, w, h);
    }

    // ctx.strokeStyle = 'white';
    // ctx.beginPath();
    // for (const {a, b} of links) {
    //   ctx.moveTo(a.x, a.y);
    //   ctx.lineTo(b.x, b.y);
    // }
    // ctx.stroke();

    for (const {x, y, rad, color} of balls) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.fillText('Physics: ' + Math.round(ms) + 'ms', 3, 12);
    ctx.fillText(
      'Render: ' + Math.round(performance.now() - start) + 'ms',
      3,
      22
    );
  }
}
