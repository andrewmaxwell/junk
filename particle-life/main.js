import Grid from '../particle-fluid/Grid.js';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const numParticles = 6000;
const numColors = 8;
const radius = 64;
const friction = 0.9;
const force = 0.001;
const minThreshold = 0.1;
const maxThreshold = 0.9;
// const maxVelocity = 4;

const repulsion = 1;

let xCoord,
  yCoord,
  xSpeed,
  ySpeed,
  attractions,
  thresholds,
  vicinityCache,
  grid;

const resize = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  grid = new Grid(radius, innerWidth, innerHeight);
};

const reset = () => {
  xCoord = new Float32Array(numParticles);
  yCoord = new Float32Array(numParticles);
  xSpeed = new Float32Array(numParticles);
  ySpeed = new Float32Array(numParticles);
  vicinityCache = new Array(numParticles);
  attractions = new Float32Array(numColors * numColors);
  thresholds = new Float32Array(numColors * numColors);

  for (let i = 0; i < numParticles; i++) {
    xCoord[i] = Math.random() * innerWidth;
    yCoord[i] = Math.random() * innerHeight;

    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 2;
    xSpeed[i] = speed * Math.cos(angle);
    ySpeed[i] = speed * Math.sin(angle);
  }

  for (let i = 0; i < numColors * numColors; i++) {
    attractions[i] = Math.random() * 2 - 1;
    thresholds[i] =
      minThreshold + Math.random() * (maxThreshold - minThreshold);
  }
  resize();
};

const iterate = () => {
  grid.clear();
  for (let i = 0; i < numParticles; i++) {
    // const m = maxVelocity / Math.hypot(xSpeed[i], ySpeed[i]);
    // if (m < 1) {
    //   xSpeed[i] *= m;
    //   ySpeed[i] *= m;
    // }

    xCoord[i] += xSpeed[i];
    yCoord[i] += ySpeed[i];
    xSpeed[i] *= friction;
    ySpeed[i] *= friction;

    if (xCoord[i] < 0) {
      xCoord[i] = 0;
      xSpeed[i] *= -1;
    } else if (xCoord[i] > innerWidth) {
      xCoord[i] = innerWidth;
      xSpeed[i] *= -1;
    }
    if (yCoord[i] < 0) {
      yCoord[i] = 0;
      ySpeed[i] *= -1;
    } else if (yCoord[i] > innerHeight) {
      yCoord[i] = innerHeight;
      ySpeed[i] *= -1;
    }

    vicinityCache[i] = grid.add(xCoord[i], yCoord[i], i);
  }
};

const interact = () => {
  for (let i = 0; i < numParticles; i++) {
    const iColor = i % numColors;
    for (let j = 0; j < vicinityCache[i].length; j++) {
      const n = vicinityCache[i][j];
      if (n === i) continue;

      const dx = xCoord[n] - xCoord[i];
      const dy = yCoord[n] - yCoord[i];
      const sqDist = dx * dx + dy * dy;
      if (sqDist >= radius * radius) continue;

      const x = Math.sqrt(sqDist) / radius;
      const a = attractions[iColor * numColors + (n % numColors)];
      const t = thresholds[iColor * numColors + (n % numColors)];
      const attraction =
        (x < t
          ? ((a + repulsion) / t) * x - repulsion
          : (a * (1 - x)) / (1 - t)) * force;

      // const attraction = -(1 - sqDist / radius / radius) * 0.01;

      xSpeed[i] += attraction * dx;
      ySpeed[i] += attraction * dy;
    }
  }
};

const draw = () => {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = 0; i < numColors; i++) {
    ctx.strokeStyle = `hsl(${(i / numColors) * 360}, 100%, 75%)`;
    ctx.beginPath();
    for (let j = i; j < numParticles; j += numColors) {
      ctx.moveTo(xCoord[j], yCoord[j]);
      ctx.lineTo(xCoord[j] - xSpeed[j], yCoord[j] - ySpeed[j]);
    }
    ctx.stroke();
  }
};

const loop = () => {
  draw();
  iterate();
  interact();
  requestAnimationFrame(loop);
};

reset();
loop();

window.addEventListener('resize', resize);
