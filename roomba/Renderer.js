const statWidth = 200;
const statHeight = 80;

export class Renderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    canvas.width = this.width = width;
    canvas.height = this.height = height;
    this.ctx = canvas.getContext('2d');
  }
  render(roomba, trailMap, stats) {
    const {ctx, width, height} = this;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.putImageData(trailMap.trailMap, 0, 0);

    ctx.fillStyle = roomba.isColliding ? '#F00' : '#000';
    ctx.beginPath();
    ctx.arc(roomba.x, roomba.y, roomba.rad, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.save();
    ctx.translate(roomba.x, roomba.y);
    ctx.rotate(roomba.angle);
    ctx.beginPath();
    ctx.moveTo(roomba.rad, 0);
    ctx.lineTo(-roomba.rad / 2, -roomba.rad / 2);
    ctx.lineTo(-roomba.rad / 2, roomba.rad / 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#8882';
    ctx.fillRect(0, height - statHeight, statWidth, statHeight);

    ctx.fillStyle = '#8888';
    ctx.beginPath();
    ctx.moveTo(width - statWidth, height);
    for (let i = 0; i < stats.length; i++) {
      const x = (i / (stats.length - 1)) * statWidth;
      const y = height - (stats[i] / 100) * statHeight;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(statWidth, height);
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.fillText(`Iterations: ${stats.length}`, 3, height - 13);
    ctx.fillText(
      `Complete: ${trailMap.getPercentClean().toFixed(1)}%`,
      3,
      height - 3
    );
  }
}
