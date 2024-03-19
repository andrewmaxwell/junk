const Q = Math.sqrt(0.75);

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
  getCoords(e, rows) {
    const size = innerHeight / rows / Q;
    return {
      x: Math.floor(e.pageX / (size * 0.5) - 0.5),
      y: Math.floor(e.pageY / (size * Q)),
    };
  }
  render(game, cursor) {
    const {ctx} = this;

    const {rows, cols} = game;
    const size = innerHeight / rows / Q;

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    ctx.scale(size * 0.5, size * Q);

    ctx.fillStyle = 'white';

    // background grid
    ctx.globalAlpha = 1 / 32;
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = y % 2; x < cols; x += 2) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1, y + 1);
        ctx.lineTo(x + 2, y);
        ctx.lineTo(x, y);
      }
    }
    ctx.fill();

    // living cells
    ctx.globalAlpha = 3 / 4;
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!game.get(x, y)) continue;
        const y1 = (x + y) % 2;
        ctx.moveTo(x, y + y1);
        ctx.lineTo(x + 1, y + (1 - y1));
        ctx.lineTo(x + 2, y + y1);
        ctx.lineTo(x, y + y1);
      }
    }
    ctx.fill();

    // mouse
    if (cursor) {
      ctx.fillStyle = 'rgba(0,0,255,0.5)';
      ctx.beginPath();
      const my1 = (cursor.x + cursor.y) % 2;
      ctx.moveTo(cursor.x, cursor.y + my1);
      ctx.lineTo(cursor.x + 1, cursor.y + (1 - my1));
      ctx.lineTo(cursor.x + 2, cursor.y + my1);
      ctx.fill();
    }

    ctx.restore();
  }
}
