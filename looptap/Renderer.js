const ballRad = 32; // pixels

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
  }
  drawTarget(ctx, rad, targetStart, targetLen) {
    ctx.lineWidth = ballRad * 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#BBD';
    ctx.beginPath();
    ctx.arc(0, 0, rad, targetStart + 0.1, targetStart + targetLen - 0.1);
    ctx.stroke();
  }
  drawBall(ctx, rad, angle, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      rad * Math.cos(angle),
      rad * Math.sin(angle),
      ballRad,
      0,
      2 * Math.PI
    );
    ctx.fill();
  }
  drawPoints(ctx, points) {
    ctx.font = '72px sans-serif';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(points, 0, 0);
  }
  drawBest(ctx, best) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#AAA';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Best: ' + best, 0, 50);
  }
  drawGraph(ctx, history, best) {
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      ctx.lineTo(
        (i / history.length) * innerWidth,
        (1 - history[i] / best) * innerHeight
      );
    }
    ctx.lineTo(innerWidth, innerHeight);
    ctx.fill();
  }
  render({angle, targetStart, targetLen, points, fail, best, history}) {
    const ctx = this.canvas.getContext('2d');
    const rad = Math.min(innerWidth, innerHeight) / 2 - ballRad;

    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;

    this.drawGraph(ctx, history, best);

    ctx.translate(innerWidth / 2, innerHeight / 2);

    this.drawTarget(ctx, rad, targetStart, targetLen);
    if (fail) this.drawBall(ctx, rad, fail, '#FCC');
    this.drawBall(ctx, rad, angle, '#555');
    this.drawPoints(ctx, points);
    this.drawBest(ctx, best);
  }
}
