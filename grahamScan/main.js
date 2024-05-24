// Graham Scan Algorithm

const getAngle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

const sqDist = (a, b) => (b.x - a.x) ** 2 + (b.y - a.y) ** 2;

const isCounterClockwise = (a, b, c) =>
  (b.x - a.x) * (c.y - a.y) <= (b.y - a.y) * (c.x - a.x);

const getConvexHull = (points) => {
  const minYPoint = points.reduce((min, p) =>
    p.y < min.y || (p.y === min.y && p.x < min.x) ? p : min
  );

  return points
    .toSorted(
      (a, b) =>
        getAngle(minYPoint, a) - getAngle(minYPoint, b) ||
        sqDist(minYPoint, a) - sqDist(minYPoint, b)
    )
    .reduce((hull, p) => {
      while (
        hull.length >= 2 &&
        isCounterClockwise(hull[hull.length - 2], hull[hull.length - 1], p)
      ) {
        hull.pop();
      }
      hull.push(p);
      return hull;
    }, []);
};

////

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const pts = [];
const draw = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;

  for (const {x, y} of pts) ctx.fillRect(x - 1, y - 1, 2, 2);

  ctx.fillStyle = 'rgba(0,0,255,0.25)';
  ctx.beginPath();
  for (const {x, y} of getConvexHull(pts)) ctx.lineTo(x, y);
  ctx.fill();
  ctx.closePath();
  ctx.stroke();
};

window.onmousemove = (e) => {
  if (e.buttons !== 1) return;
  pts.push({x: e.x, y: e.y});
  draw();
};
window.ondblclick = () => {
  pts.length = 0;
};

document.querySelector('pre').innerHTML = (
  await (await fetch('main.js')).text()
).split('////')[0];
