const canvas = document.querySelector('canvas');
const width = (canvas.width = innerWidth);
const height = (canvas.height = innerHeight);
const ctx = canvas.getContext('2d');

const params = {numPts: 6, numBezierPts: 256};

let pts, xc, yc;

const reset = () => {
  pts = [];
  for (let i = 0; i < params.numPts; i++) {
    const angle = 2 * Math.PI * Math.random();
    pts[i] = {
      x: Math.random() * width,
      y: Math.random() * height,
      xs: 3 * Math.sin(angle),
      ys: 3 * Math.cos(angle),
    };
  }
  xc = new Float32Array(params.numPts);
  yc = new Float32Array(params.numPts);
  ctx.lineWidth = 0.1;
};

const loop = () => {
  ctx.clearRect(0, 0, width, height);

  for (const p of pts) {
    p.x += p.xs;
    p.y += p.ys;

    if (p.x < 0) {
      p.x = 0;
      p.xs *= -1;
    } else if (p.x > width - 1) {
      p.x = width - 1;
      p.xs *= -1;
    }
    if (p.y < 0) {
      p.y = 0;
      p.ys *= -1;
    } else if (p.y > height - 1) {
      p.y = height - 1;
      p.ys *= -1;
    }
  }

  const {numPts, numBezierPts} = params;
  for (let i = 0; i < numBezierPts; i++) {
    const hue = (360 * i) / numBezierPts;
    const opacity = 1000 / numPts / numBezierPts;
    ctx.strokeStyle = `hsla(${hue},100%,50%,${opacity})`;
    ctx.beginPath();
    for (let j = 0; j < numPts; j++) {
      xc[j] = pts[j].x;
      yc[j] = pts[j].y;
    }
    const p = i / (numBezierPts - 1);
    for (let j = 1; j < numPts; j++) {
      for (let k = 0; k < numPts - j; k++) {
        xc[k] = xc[k] * (1 - p) + xc[k + 1] * p;
        yc[k] = yc[k] * (1 - p) + yc[k + 1] * p;
        ctx.lineTo(xc[k], yc[k]);
      }
    }
    ctx.stroke();
  }

  requestAnimationFrame(loop);
};

reset();
loop();

const gui = new window.dat.GUI();
gui.add(params, 'numPts', 3, 50).step(1).onChange(reset);
gui.add(params, 'numBezierPts', 2, 1024).step(1);
