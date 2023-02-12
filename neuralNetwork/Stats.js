export class Stats {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = this.canvas.getContext('2d');
    this.values = [];
  }
  push(value) {
    this.values.push(value);
  }
  render() {
    const {canvas, values, ctx} = this;
    const width = (canvas.width = innerWidth);
    const height = (canvas.height = innerHeight);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.moveTo(0, height);
    for (let i = 0; i < values.length; i++) {
      const x = width * (i / (values.length - 1));
      const y = height * values[i];
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.font = '20px sans-serif';
    const lastValue = values[values.length - 1];
    ctx.fillText(
      `Accuracy: ${((1 - lastValue) * 100).toFixed()}%`,
      5,
      height - 10
    );
  }
}
