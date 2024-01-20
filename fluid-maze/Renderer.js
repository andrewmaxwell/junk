export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }
  resize() {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
  }
  render({numParticles, xCoord, yCoord, xPrev, yPrev, blocks, radius}, time) {
    const {ctx} = this;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'white';

    ctx.beginPath();
    for (let i = 0; i < numParticles; i++) {
      ctx.moveTo(xCoord[i], yCoord[i]);
      ctx.lineTo(xPrev[i], yPrev[i]);
    }
    ctx.stroke();

    ctx.fillStyle = '#FFF8';

    for (let {x, y, w, h} of blocks) {
      ctx.fillRect(x * radius, y * radius, w * radius, h * radius);
    }

    ctx.fillText(time.toFixed(1), 2, innerHeight - 2);
  }
}
