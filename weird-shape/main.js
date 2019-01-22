'use strict';
console.clear();

const C = document.querySelector('#C');
const T = C.getContext('2d');
const W = (C.width = innerWidth);
const H = (C.height = innerHeight);

const rad = 8;
const force = 0.001;
const friction = 0.9;

const mouseRad = 50;
const mouseStrength = 0.5;

var frame = 0;

const pts = [
  {x: W / 2 - 10, y: H / 2, xs: 0, ys: 0},
  {x: W / 2 + 10, y: H / 2, xs: 0, ys: 0},
  {x: W / 2, y: H / 2 - 10, xs: 0, ys: 0}
];

const partitions = (function() {
  var grid = [];
  var vic = [];
  var rows = Math.ceil(H / rad);
  var cols = Math.ceil(W / rad);
  for (var i = 0; i < rows * cols; i++) {
    grid[i] = [];
    vic[i] = [];
  }
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      for (var rr = Math.max(0, r - 1); rr < Math.min(rows, r + 2); rr++) {
        for (var cc = Math.max(0, c - 1); cc < Math.min(cols, c + 2); cc++) {
          vic[r * cols + c].push(grid[rr * cols + cc]);
        }
      }
    }
  }
  return {
    clear() {
      for (var i = 0; i < rows * cols; i++) {
        grid[i].length = 0;
      }
    },
    add(p, i) {
      grid[Math.floor(p.y / rad) * cols + Math.floor(p.x / rad)].push(i);
    },
    eachPair(func) {
      for (var i = 0; i < grid.length; i++) {
        // each grid cell
        for (var j = 0; j < grid[i].length; j++) {
          // each node in grid cell
          for (var k = 0; k < vic[i].length; k++) {
            // each cell in grid's vicinity
            for (var l = 0; l < vic[i][k].length; l++) {
              // each node in vicinity cell
              if (grid[i][j] > vic[i][k][l]) func(grid[i][j], vic[i][k][l]);
            }
          }
        }
      }
    }
  };
})();

const add = () => {
  var index = Math.floor(Math.random() * pts.length);
  var a = pts[index];
  var b = pts[(index + 1) % pts.length];
  pts.splice(index + 1, 0, {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    xs: 0,
    ys: 0
  });
};

const applyForce = (ai, bi, always) => {
  var a = pts[ai];
  var b = pts[bi];
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var amt = (2 * rad - Math.hypot(dx, dy)) * force;
  if (amt > 0 || always) {
    a.xs -= dx * amt;
    a.ys -= dy * amt;
    b.xs += dx * amt;
    b.ys += dy * amt;
  }
};

const move = () => {
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    p.x = Math.max(0, Math.min(W - 1, p.x + p.xs));
    p.y = Math.max(0, Math.min(H - 1, p.y + p.ys));
    p.xs *= friction;
    p.ys *= friction;
    partitions.add(p, i);
  }
};

const forces = () => {
  partitions.eachPair(applyForce);
  for (var i = 0; i < pts.length; i++) {
    applyForce(i, (i + 1) % pts.length, true);
  }
};

const draw = () => {
  T.clearRect(0, 0, W, H);

  T.fillStyle = 'black';
  T.beginPath();
  pts.forEach(p => {
    T.lineTo(p.x, p.y);
  });
  T.fill();

  T.fillStyle = 'rgba(128,128,128,0.25)';
  T.beginPath();
  pts.forEach(p => {
    T.moveTo(p.x + rad, p.y);
    T.arc(p.x, p.y, rad, 0, 2 * Math.PI);
  });
  T.fill();
};

const loop = () => {
  partitions.clear();
  if (frame % 8 === 0) add();
  move();
  forces();
  draw();
  frame++;
  requestAnimationFrame(loop);
};

C.onmousemove = e => {
  var x = e.offsetX;
  var y = e.offsetY;
  var mx = e.movementX;
  var my = e.movementY;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    var dx = p.x - x;
    var dy = p.y - y;
    var amt =
      (1 - Math.min(1, (dx * dx + dy * dy) / mouseRad / mouseRad)) *
      mouseStrength;
    p.xs = mx * amt + p.xs * (1 - amt);
    p.ys = my * amt + p.ys * (1 - amt);
  }
};

loop();
