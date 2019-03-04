// Used some code from https://peeke.nl/simulating-blobs-of-fluid

import Grid from './Grid.js';

var canvas = document.querySelector('canvas');
var T = canvas.getContext('2d');

var NUM = 2 ** 12;

var params = {
  rad: 50,
  restDensity: 0.2,
  stiffness: 300,
  stiffnessNear: 700,
  speed: 0.001,
  gravity: 50
};

var width,
  height,
  xc,
  yc,
  xp,
  yp,
  vic,
  grid,
  grav = {x: 0, y: 1};

var reset = () => {
  handlers.resize();
  xc = new Float32Array(NUM); // x coords
  yc = new Float32Array(NUM); // y coords
  xp = new Float32Array(NUM); // x prev
  yp = new Float32Array(NUM); // y prev
  vic = []; // vicinity cache

  for (var i = 0; i < NUM; i++) {
    xc[i] = xp[i] = width * Math.random();
    yc[i] = yp[i] = height * Math.random();
  }
};

var ni = new Int16Array(NUM); // neighbor index
var gr = new Float32Array(NUM); // neighbor gradient
var nx = new Float32Array(NUM); // neighbor dx
var ny = new Float32Array(NUM); // neighboy dy
var nd = new Float32Array(NUM); // neighbor distance

var interact = () => {
  var {rad, restDensity, stiffness, stiffnessNear, speed} = params;
  for (var i = 0; i < NUM; i++) {
    var count = 0;
    var density = 0;
    var nearDensity = 0;
    for (var k = 0; k < vic[i].length; k++) {
      var n = vic[i][k];
      var dx = xc[n] - xc[i];
      var dy = yc[n] - yc[i];
      var lsq = dx * dx + dy * dy;
      if (!lsq || lsq >= rad * rad) continue;

      var dist = Math.sqrt(lsq);
      var g = 1 - dist / rad;

      density += g * g;
      nearDensity += g * g * g;
      ni[count] = n;
      gr[count] = g;
      nx[count] = dx;
      ny[count] = dy;
      nd[count] = dist;
      count++;

      // if (n < i && dist < rad * 0.5) {
      //   T.moveTo(xc[i], yc[i]);
      //   T.lineTo(xc[n], yc[n]);
      // }
    }

    var pressure =
      (stiffness * stiffness * speed * (density - rad * restDensity)) /
      (rad * rad);
    var nearPressure =
      (stiffnessNear * stiffnessNear * speed * nearDensity) / (rad * rad);

    for (k = 0; k < count; k++) {
      var amt = (pressure * gr[k] + nearPressure * gr[k] * gr[k]) / nd[k];
      xc[i] -= nx[k] * amt;
      yc[i] -= ny[k] * amt;
      xc[ni[k]] += nx[k] * amt;
      yc[ni[k]] += ny[k] * amt;
    }
  }
};

var rates = new Array(30).fill(0);
var frame = 0;
var loop = () => {
  requestAnimationFrame(loop);
  var start = performance.now();
  grid.clear();

  T.clearRect(0, 0, width, height);
  T.beginPath();

  var {gravity, speed} = params;
  for (var i = 0; i < NUM; i++) {
    var xVel = xc[i] - xp[i] + gravity * speed * grav.x;
    var yVel = yc[i] - yp[i] + gravity * speed * grav.y;
    xp[i] = xc[i];
    yp[i] = yc[i];

    T.moveTo(xc[i], yc[i]);
    xc[i] += xVel;
    yc[i] += yVel;
    T.lineTo(xc[i], yc[i]);

    if (xc[i] < 0) {
      xc[i] = 0;
      xp[i] = -1;
    } else if (xc[i] > width - 1) {
      xc[i] = width - 1;
      xp[i] = width;
    }
    if (yc[i] < 0) {
      yc[i] = 0;
      yp[i] = -1;
    } else if (yc[i] > height - 1) {
      yc[i] = height - 1;
      yp[i] = height;
    }

    vic[i] = grid.add(xc[i], yc[i], i);
  }

  T.stroke();

  interact();

  if (frame > rates.length)
    T.fillText(
      Math.round(rates.reduce((s, v) => s + v, 0) / rates.length),
      5,
      10
    );

  rates[frame % rates.length] = performance.now() - start;
  frame++;
};

var gui = new window.dat.GUI();
gui.add(params, 'rad', 5, 100).onChange(window.onresize);
gui.add(params, 'restDensity', 0, 1);
gui.add(params, 'stiffness', 0, 1000);
gui.add(params, 'stiffnessNear', 0, 1000);
gui.add(params, 'speed', 0, 0.01);
gui.add(params, 'gravity', 0, 50);
gui.close();

const handlers = {
  resize: () => {
    width = canvas.width = innerWidth;
    height = canvas.height = innerHeight;
    grid = new Grid(params.rad, width, height);
    T.fillStyle = T.strokeStyle = 'white';
    T.lineWidth = 2;
    T.lineCap = 'round';
  },
  mousemove: e => {
    if (!e.which) return;
    for (var i = 0; i < NUM; i++) {
      if (Math.hypot(xc[i] - e.offsetX, yc[i] - e.offsetY) < 150) {
        xp[i] -= 0.1 * e.movementX;
        yp[i] -= 0.1 * e.movementY;
      }
    }
  },
  deviceorientation: e => {
    e.preventDefault();
    grav.x = e.gamma / 90;
    grav.y = e.beta / 90;
  }
  // devicemotion: e => {
  //   for (var i = 0; i < NUM; i++) {
  //     xp[i] -= e.acceleration.x;
  //     yp[i] += e.acceleration.y;
  //   }
  // }
};

for (var e in handlers) window.addEventListener(e, handlers[e]);

reset();
loop();
