const numPts = 1000;
const startRad = 10;
const startColor = [66, 135, 245];
const endColor = [12, 55, 122];

const pts = [];

for (let i = 0; i < numPts; i++) {
  const g = i / (numPts - 1);
  pts[i] = {
    x: innerWidth / 2,
    y: innerHeight / 2,
    angle: Math.random() * 2 * Math.PI,
    color: `rgb(${startColor
      .map((s, j) => Math.round(s * (1 - g) + endColor[j] * g))
      .join(',')})`,
  };
}

console.log(pts);

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
canvas.width = innerWidth;
canvas.height = innerHeight;
ctx.lineWidth = 0.5;

let frame = 0;

const loop = () => {
  const rad = startRad * 0.999 ** frame;
  pts.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    p.x += Math.cos(p.angle);
    p.y += Math.sin(p.angle);
    p.angle += ((Math.random() - 0.5) * frame) / 1000;
  });
  frame++;
  requestAnimationFrame(loop);
};

loop();
