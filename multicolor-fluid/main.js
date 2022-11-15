// Used some code from https://peeke.nl/simulating-blobs-of-fluid

import Grid from '../particle-fluid/Grid.js';

var ctx = document.querySelector('canvas').getContext('2d');

var maxParticles = 2 ** 15;

var params = {
  numParticles: 10000,
  numColors: 2,
  radius: 32,
  gravity: 0.01,
  stiffness: 100,
  repulsion: 0.05,
  mouseRadius: 100,
  mousePower: 0.2,
};

var width, height, xCoord, yCoord, xPrev, yPrev, vicinityCache, grid;

function resize() {
  width = ctx.canvas.width = innerWidth;
  height = ctx.canvas.height = innerHeight;
  ctx.fillStyle = 'white';
  grid = new Grid(params.radius, width, height);
  ctx.lineCap = 'round';
}

function reset() {
  resize();
  xCoord = new Float32Array(maxParticles);
  yCoord = new Float32Array(maxParticles);
  xPrev = new Float32Array(maxParticles);
  yPrev = new Float32Array(maxParticles);
  vicinityCache = new Array(maxParticles);
  for (var i = 0; i < maxParticles; i++) {
    xCoord[i] = xPrev[i] = width * Math.random();
    yCoord[i] = yPrev[i] = height * Math.random();
  }
}

function iterate() {
  grid.clear();
  for (var i = 0; i < params.numParticles; i++) {
    var xVel = xCoord[i] - xPrev[i];
    var yVel = yCoord[i] - yPrev[i] + (i % params.numColors) * params.gravity;
    xPrev[i] = xCoord[i];
    yPrev[i] = yCoord[i];
    xCoord[i] += xVel;
    yCoord[i] += yVel;

    if (xCoord[i] < 0) {
      xCoord[i] = 0;
      xPrev[i] = -1;
    } else if (xCoord[i] > width - 1) {
      xCoord[i] = width - 1;
      xPrev[i] = width;
    }
    if (yCoord[i] < 0) {
      yCoord[i] = 0;
      yPrev[i] = -1;
    } else if (yCoord[i] > height - 1) {
      yCoord[i] = height - 1;
      yPrev[i] = height;
    }

    vicinityCache[i] = grid.add(xCoord[i], yCoord[i], i);
  }
}

var neighborIndex = new Int16Array(maxParticles);
var neighborGradient = new Float32Array(maxParticles);
var neighborX = new Float32Array(maxParticles);
var neighborY = new Float32Array(maxParticles);

function interact() {
  var {radius, stiffness, repulsion, numParticles, numColors} = params;
  var invRad2 = 1 / radius ** 2;
  for (var i = 0; i < numParticles; i++) {
    var numNeighbors = 0;
    var nearDensity = 0;
    for (var k = 0; k < vicinityCache[i].length; k++) {
      var n = vicinityCache[i][k];
      if (n === i) continue;
      var dx = xCoord[n] - xCoord[i];
      var dy = yCoord[n] - yCoord[i];
      var lsq = Math.max(1, dx * dx + dy * dy);
      if (lsq >= radius * radius) continue;

      var g = 1 - Math.sqrt(lsq) / radius;
      nearDensity += g * g * g;
      neighborIndex[numNeighbors] = n;
      neighborGradient[numNeighbors] = g;
      neighborX[numNeighbors] = dx;
      neighborY[numNeighbors] = dy;
      numNeighbors++;
    }

    var nearPressure = stiffness * nearDensity * invRad2;

    for (k = 0; k < numNeighbors; k++) {
      n = neighborIndex[k];
      var ng = neighborGradient[k];
      var amt =
        n % numColors === i % numColors
          ? (nearPressure * ng * ng) / (1 - ng) / radius
          : ng * ng * repulsion;
      var ax = neighborX[k] * amt;
      var ay = neighborY[k] * amt;
      xCoord[i] -= ax;
      yCoord[i] -= ay;
      xCoord[n] += ax;
      yCoord[n] += ay;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  for (let i = 0; i < params.numColors; i++) {
    ctx.strokeStyle = `hsl(${(i / params.numColors + 0.1) * 360},100%,80%)`;
    ctx.beginPath();
    for (var j = i; j < params.numParticles; j += params.numColors) {
      ctx.moveTo(xCoord[j], yCoord[j]);
      ctx.lineTo(xPrev[j], yPrev[j]);
    }
    ctx.stroke();
  }
}

function loop() {
  requestAnimationFrame(loop);
  iterate();
  interact();
  draw();
}

var gui = new window.dat.GUI();
gui.add(params, 'numParticles', 1000, maxParticles);
gui.add(params, 'numColors', 1, 10).step(1);
gui.add(params, 'radius', 5, 100).onChange(window.onresize);
gui.add(params, 'gravity', 0, 0.1);
gui.add(params, 'stiffness', 0, 2000);
gui.add(params, 'repulsion', -0.01, 0.1);
gui.add(params, 'mouseRadius', 0, 200);
gui.add(params, 'mousePower', 0, 1);
gui.close();

window.addEventListener('resize', resize);

window.addEventListener('mousemove', (e) => {
  if (!e.buttons) return;
  for (var i = 0; i < params.numParticles; i++) {
    var dist = Math.hypot(xCoord[i] - e.offsetX, yCoord[i] - e.offsetY);
    var amt = params.mousePower * (1 - dist / params.mouseRadius);
    if (amt < 0) continue;
    xPrev[i] -= amt * e.movementX;
    yPrev[i] -= amt * e.movementY;
  }
});

reset();
loop();
