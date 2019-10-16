export class Renderer {
  constructor({canvas}) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = canvas.getContext('2d');
    this.ctx.strokeStyle = 'white';
    // this.img = document.querySelector('img');
  }
  draw({player, things}, distances, params) {
    const {ctx, width, height} = this;
    ctx.clearRect(0, 0, width, height);
    this.drawFirstPerson(distances, params);
    if (params.showMap) {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(Math.PI * 1.5 - player.angle);
      ctx.translate(-player.x, -player.y);
      this.drawTopDownDistances(player, distances);
      this.drawThings(things);
      this.drawPlayer(player);
      ctx.restore();
    }
  }
  drawThings(things) {
    const {ctx} = this;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    things.forEach(({x1, y1, x2, y2, x, y, radius}) => {
      if (radius) {
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
      } else {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
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
    const w = 1 / distances.length;
    ctx.fillStyle = 'white';
    ctx.save();
    ctx.scale(width, height);
    distances.forEach(({dist}, i) => {
      const h = params.wallHeight / dist;
      ctx.globalAlpha = 1 - Math.min(1, Math.sqrt(dist / params.renderDist));
      ctx.fillRect(i * w, 0.5 - h, w, h * 2);
      // ctx.drawImage(
      //   this.img,
      //   i * w * width, // sx
      //   (0.5 - h) * height, // sy
      //   w * width, // sw
      //   h * 2 * height, // sh

      //   i * w, // dx
      //   0.5 - h, // dy
      //   w, // dw
      //   h * 2 // dh
      // );
    });
    ctx.restore();
  }
}
