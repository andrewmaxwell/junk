export class Renderer {
  constructor({canvas}) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = canvas.getContext('2d');
  }
  draw(player, walls, distances, params) {
    const {ctx, width, height} = this;
    ctx.clearRect(0, 0, width, height);
    this.drawTopDownDistances(player, distances);
    this.drawFirstPerson(distances, params);
    this.drawWalls(walls);
    this.drawPlayer(player);
  }
  drawWalls(walls) {
    const {ctx} = this;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    walls.forEach(({x1, y1, x2, y2}) => {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });
    ctx.stroke();
  }
  drawPlayer(player) {
    const {ctx} = this;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 5, 0, 2 * Math.PI);
    ctx.fill();
  }
  drawTopDownDistances(player, distances) {
    const {ctx} = this;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    distances.forEach(({angle, dist}) => {
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(
        player.x + dist * Math.cos(angle),
        player.y + dist * Math.sin(angle)
      );
    });
    ctx.stroke();
  }
  drawFirstPerson(distances, params) {
    const {ctx, width, height} = this;
    ctx.fillStyle = 'black';
    ctx.save();
    ctx.scale(width, height);
    distances.forEach(({dist}, i) => {
      const h = params.wallHeight / dist;
      ctx.globalAlpha = Math.min(1, params.wallDarkness / Math.sqrt(dist));
      ctx.fillRect(i / distances.length, 0.5 - h, 1 / distances.length, h * 2);
    });
    ctx.restore();
  }
}
