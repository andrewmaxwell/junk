export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.frames = 0;
    this.fps = 0;
    this.lastFpsTime = performance.now();
    this.resize();
  }

  resize() {
    // back the canvas with real device pixels so the lines aren't blurry
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    for (const {x, y, w, h} of blocks) {
      ctx.fillRect(x * radius, y * radius, w * radius, h * radius);
    }

    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 500) {
      this.fps = (this.frames * 1000) / (now - this.lastFpsTime);
      this.frames = 0;
      this.lastFpsTime = now;
    }

    ctx.font = '12px monospace';
    ctx.fillText(
      `${numParticles} particles  ${time.toFixed(1)}ms  ${this.fps.toFixed(0)}fps`,
      6,
      innerHeight - 6,
    );
  }
}
