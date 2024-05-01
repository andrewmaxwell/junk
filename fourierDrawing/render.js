export const render = (canvas, points, gears, time) => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.strokeStyle = '#FFF8';

  ctx.beginPath();
  for (const p of points) {
    ctx.moveTo(p.x + 1, p.y);
    ctx.arc(p.x, p.y, 1, 0, 7);
  }

  let cx = 0;
  let cy = 0;
  for (const g of gears) {
    ctx.moveTo(cx + g.radius, cy);
    ctx.arc(cx, cy, g.radius, 0, 2 * Math.PI);
    ctx.moveTo(cx, cy);
    cx += g.radius * Math.cos(g.speed * time + g.phase);
    cy += g.radius * Math.sin(g.speed * time + g.phase);
    ctx.lineTo(cx, cy);
    if (time < 2 * Math.PI) g.path.push({x: cx, y: cy});
  }
  ctx.stroke();

  for (let g = 0; g < gears.length; g++) {
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${(360 * g) / gears.length}, 100%, 75%, 0.5)`;
    for (const {x, y} of gears[g].path) ctx.lineTo(x, y);
    ctx.stroke();
  }

  const last = gears[gears.length - 1];
  if (last) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const {x, y} of last.path) ctx.lineTo(x, y);
    ctx.stroke();
  }
};
