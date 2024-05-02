const tau = Math.PI * 2;

export const render = (canvas, points, gears, time) => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.strokeStyle = 'white';

  ctx.beginPath();
  for (const p of points) {
    ctx.moveTo(p.x + 1, p.y);
    ctx.arc(p.x, p.y, 1, 0, 7);
  }

  gears = gears.slice(0, 2 + time / tau);

  let cx = 0;
  let cy = 0;
  for (const g of gears) {
    ctx.moveTo(cx, cy);
    cx += g.radius * Math.cos(g.speed * time + g.phase);
    cy += g.radius * Math.sin(g.speed * time + g.phase);
    ctx.lineTo(cx, cy);
  }
  ctx.stroke();

  for (let i = 0; i < gears.length - 1; i++) {
    const hue = (360 * i) / gears.length;
    ctx.strokeStyle = `hsla(${hue}, 100%, 75%, 0.33)`;
    ctx.beginPath();
    for (const {x, y} of gears[i].path) ctx.lineTo(x, y);
    ctx.stroke();
  }

  if (gears.length) {
    const i = gears.length - 1;
    const hue = (360 * i) / gears.length;
    const numPts = ((time % tau) * gears[i].path.length) / tau;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.strokeStyle = `hsl(${hue}, 100%, 75%)`;
    for (const {x, y} of gears[i].path.slice(0, numPts)) ctx.lineTo(x, y);
    ctx.stroke();
  }
};
