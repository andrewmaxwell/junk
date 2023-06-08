export class Renderer {
  constructor(canvas, scale) {
    this.canvas = canvas;
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    this.scale = scale;
  }
  render(grid, mouse) {
    const {canvas, scale} = this;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    // pressure
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const {wall, pr} = grid[y][x];
        ctx.globalAlpha = wall ? 1 : Math.min(1, Math.abs(pr));
        ctx.fillStyle = wall ? 'gray' : pr < 0 ? 'red' : 'green';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    // velocity
    // ctx.globalAlpha = 1;
    // ctx.strokeStyle = 'white';
    // ctx.beginPath();
    // for (let y = 0; y < grid.length; y++) {
    //   for (let x = 0; x < grid[y].length; x++) {
    //     ctx.moveTo(x * scale, y * scale);
    //     ctx.lineTo(x * scale + grid[y][x].xs, y * scale + grid[y][x].ys);
    //   }
    // }
    // ctx.stroke();

    // path
    // let x = mouse.x;
    // let y = mouse.y;
    // ctx.beginPath();
    // ctx.moveTo(x, y);
    // for (let i = 0; i < 1000; i++) {
    //   const g = grid[Math.floor(y / scale)]?.[Math.floor(x / scale)];
    //   if (!g) break;
    //   x += g.xs;
    //   y += g.ys;
    //   ctx.lineTo(x, y);
    // }
    // ctx.stroke();
  }
}
