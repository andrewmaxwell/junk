export class Renderer {
  constructor(canvas, width, height) {
    this.width = canvas.width = width;
    this.height = canvas.height = height;
    this.ctx = canvas.getContext('2d');
  }
  drawPieces(c) {
    const {ctx} = this;
    const r = c._body.vertices;
    r.forEach((v, i) => {
      if (i) ctx.lineTo(v.x, v.y);
      else ctx.moveTo(v.x, v.y);
    });
    ctx.lineTo(r[0].x, r[0].y);
    c.children.forEach(this.drawPieces.bind(this));
  }
  render(creatures, bodies, maxLength, numWinners) {
    const {width, height, ctx} = this;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(
      width - Math.max(...bodies.map(m => m.position.x)) - maxLength,
      0
    );
    ctx.lineWidth = 0.25;

    // draw losers with only outlines
    ctx.beginPath();
    for (let i = 0; i < 100; i++) {
      ctx.moveTo(i * 100, 0);
      ctx.lineTo(i * 100, height);
    }

    for (let i = 0; i < creatures.length - numWinners; i++) {
      this.drawPieces(creatures[i]);
    }
    ctx.stroke();

    // draw winners with colors
    for (let i = creatures.length - numWinners; i < creatures.length; i++) {
      ctx.fillStyle = `hsl(${Math.round(
        (creatures[i].index / creatures.length) * 360
      )}, 100%, 80%)`;
      ctx.beginPath();
      this.drawPieces(creatures[i]);
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }
}
