export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
  }
  render({units, edges, tempEdge}, camera) {
    const {canvas} = this;
    const ctx = canvas.getContext('2d');
    const rad = 24;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(innerWidth / 2, innerHeight / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    for (const u of units) {
      ctx.moveTo(u.x + rad, u.y);
      ctx.arc(u.x, u.y, rad, 0, 2 * Math.PI);
    }
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px monospace';
    for (const u of units) {
      ctx.fillText(u.type.label, u.x, u.y);
    }

    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const {a, b} of edges.concat(tempEdge || [])) {
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      ctx.moveTo(
        a.x + ((b.x - a.x) / dist) * rad,
        a.y + ((b.y - a.y) / dist) * rad
      );
      ctx.lineTo(
        b.x + (b.type ? ((a.x - b.x) / dist) * rad : 0),
        b.y + (b.type ? ((a.y - b.y) / dist) * rad : 0)
      );
    }
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.0625)';

    // const margin = 16;
    // const types = ['AND', 'OR', 'NOT', 'MEM'];
    // ctx.fillRect(
    //   0,
    //   0,
    //   2 * (margin + rad),
    //   margin + types.length * (2 * rad + margin)
    // );

    // ctx.beginPath();
    // types.forEach((t, i) => {
    //   const y = margin + rad + i * (rad * 2 + margin);
    //   ctx.moveTo(margin + 2 * rad, y);
    //   ctx.arc(margin + rad, y, rad, 0, 2 * Math.PI);
    // });
    // ctx.fill();

    // ctx.fillText(JSON.stringify(units), 3, canvas.height - 3);
  }
}
