export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }
  resize() {
    this.canvas.width = this.width = window.innerWidth;
    this.canvas.height = this.height = window.innerHeight;
  }
  render(bodies, cuts) {
    const {ctx} = this;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.beginPath();
    bodies.forEach(({vertices}) => {
      ctx.moveTo(vertices[0].x, vertices[0].y);
      vertices.forEach(({x, y}) => ctx.lineTo(x, y));
      ctx.lineTo(vertices[0].x, vertices[0].y);
    });
    ctx.fillStyle = '#EEE';
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'black';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Cuts: ${cuts}`, 5, this.height - 5);
  }
}
