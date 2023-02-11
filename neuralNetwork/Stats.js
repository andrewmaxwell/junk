export class Stats {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = this.canvas.getContext('2d');
    this.max = 0;
    this.values = [];
  }
  push(value) {
    const {values, width, height, ctx} = this;
    this.max = Math.max(this.max, value);
    values.push(value);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.moveTo(0, height);
    for (let i = 0; i < values.length; i++) {
      const x = width * (i / (values.length - 1));
      const y = height * (values[i] / this.max);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Accuracy: ${((1 - value) * 100).toFixed()}%`, 5, height - 5);
  }
}
