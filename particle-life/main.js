import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import Grid from '../particle-fluid/Grid.js';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const defaults = {
  numParticles: 6000,
  numColors: 8,
  radius: 64,
  friction: 0.9,
  force: 0.001,
  repulsion: 1,
  minThreshold: 0.1,
  maxThreshold: 0.9,
  trails: 0.8,
};
const params = {...defaults};

let width, height, grid, nearRows, nearCols;
let xCoord, yCoord, xSpeed, ySpeed, color, attractions, thresholds;

const hue = (c) => `hsl(${(c / params.numColors) * 360}, 100%, 75%)`;

// The world wraps around, so the cells next to an edge cell include the ones
// on the far side. With fewer than 3 rows or columns, that would count a cell
// twice, so then every row or column is a neighbor.
const neighbors = (count) =>
  Array.from({length: count}, (_, i) =>
    count < 3
      ? [...Array(count).keys()]
      : [i - 1, i, i + 1].map((j) => (j + count) % count),
  );

const resize = () => {
  width = canvas.width = innerWidth;
  height = canvas.height = innerHeight;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  grid = new Grid(params.radius, width, height);
  nearRows = neighbors(grid.rows);
  nearCols = neighbors(grid.cols);
};

// rounded so that the link in the URL brings back exactly the same rules
const round = (x) => Math.round(x * 100) / 100;

const randomizeRules = () => {
  const {numColors, minThreshold, maxThreshold} = params;
  attractions = new Float32Array(numColors * numColors);
  thresholds = new Float32Array(numColors * numColors);
  for (let i = 0; i < numColors * numColors; i++) {
    attractions[i] = round(Math.random() * 2 - 1);
    thresholds[i] = round(
      minThreshold + Math.random() * (maxThreshold - minThreshold),
    );
  }
  rulesChanged();
};

const reset = () => {
  const {numParticles, numColors} = params;
  xCoord = new Float32Array(numParticles);
  yCoord = new Float32Array(numParticles);
  xSpeed = new Float32Array(numParticles);
  ySpeed = new Float32Array(numParticles);
  color = new Uint8Array(numParticles);

  for (let i = 0; i < numParticles; i++) {
    xCoord[i] = Math.random() * width;
    yCoord[i] = Math.random() * height;
    color[i] = i % numColors;

    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 2;
    xSpeed[i] = speed * Math.cos(angle);
    ySpeed[i] = speed * Math.sin(angle);
  }
};

const restart = () => {
  reset();
  randomizeRules();
};

const iterate = () => {
  const {numParticles, friction} = params;
  for (let i = 0; i < numParticles; i++) {
    xCoord[i] = (xCoord[i] + xSpeed[i] + width) % width;
    yCoord[i] = (yCoord[i] + ySpeed[i] + height) % height;
    xSpeed[i] *= friction;
    ySpeed[i] *= friction;
  }
  grid.sort(numParticles, xCoord, yCoord, xSpeed, ySpeed, color);
};

const interact = () => {
  const {numParticles, numColors, radius, force, repulsion} = params;
  const {cols, cellStart} = grid;

  for (let i = 0; i < numParticles; i++) {
    const rule = color[i] * numColors;
    for (const r of nearRows[grid.row(yCoord[i])]) {
      for (const c of nearCols[grid.col(xCoord[i])]) {
        const end = cellStart[r * cols + c + 1];
        for (let n = cellStart[r * cols + c]; n < end; n++) {
          if (n === i) continue;

          // the shortest way there, which may be across an edge
          let dx = xCoord[n] - xCoord[i];
          let dy = yCoord[n] - yCoord[i];
          if (dx > width / 2) dx -= width;
          else if (dx < -width / 2) dx += width;
          if (dy > height / 2) dy -= height;
          else if (dy < -height / 2) dy += height;

          const sqDist = dx * dx + dy * dy;
          if (sqDist >= radius * radius) continue;

          const x = Math.sqrt(sqDist) / radius;
          const a = attractions[rule + color[n]];
          const t = thresholds[rule + color[n]];
          const attraction =
            (x < t
              ? ((a + repulsion) / t) * x - repulsion
              : (a * (1 - x)) / (1 - t)) * force;

          xSpeed[i] += attraction * dx;
          ySpeed[i] += attraction * dy;
        }
      }
    }
  }
};

const draw = () => {
  const {numParticles, numColors, trails} = params;
  ctx.fillStyle = `rgba(0, 0, 0, ${1 - trails})`;
  ctx.fillRect(0, 0, width, height);
  for (let c = 0; c < numColors; c++) {
    ctx.strokeStyle = hue(c);
    ctx.beginPath();
    for (let j = 0; j < numParticles; j++) {
      if (color[j] !== c) continue;
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

// ---------- rule matrix ----------
// Row = the color being pushed, column = the color doing the pushing. Green
// pulls, red pushes away. Click to pull more, right-click or shift-click to
// push more.

const matrix = document.createElement('canvas');
const matrixSize = 220;
const mctx = matrix.getContext('2d');
matrix.width = matrix.height = matrixSize * devicePixelRatio;
matrix.style.cssText = `width:${matrixSize}px; height:${matrixSize}px; display:block; margin:6px auto; cursor:pointer`;

const cellSize = () => matrixSize / (params.numColors + 1);

const drawMatrix = () => {
  const n = params.numColors;
  const s = cellSize();
  mctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  mctx.clearRect(0, 0, matrixSize, matrixSize);
  for (let i = 0; i < n; i++) {
    mctx.fillStyle = hue(i);
    mctx.fillRect(0, (i + 1) * s + 1, s - 2, s - 2);
    mctx.fillRect((i + 1) * s + 1, 0, s - 2, s - 2);
    for (let j = 0; j < n; j++) {
      const a = attractions[i * n + j];
      mctx.fillStyle =
        a > 0 ? `rgba(80, 220, 120, ${a})` : `rgba(240, 80, 80, ${-a})`;
      mctx.fillRect((j + 1) * s + 1, (i + 1) * s + 1, s - 2, s - 2);
    }
  }
};

const cellAt = (e) => {
  const s = cellSize();
  const i = Math.floor(e.offsetY / s) - 1;
  const j = Math.floor(e.offsetX / s) - 1;
  const n = params.numColors;
  return i >= 0 && j >= 0 && i < n && j < n ? i * n + j : -1;
};

const nudge = (e, amount) => {
  e.preventDefault();
  const k = cellAt(e);
  if (k < 0) return;
  attractions[k] = round(Math.max(-1, Math.min(1, attractions[k] + amount)));
  rulesChanged();
  showValue(e);
};

const showValue = (e) => {
  const k = cellAt(e);
  matrix.title = k < 0 ? '' : `${attractions[k]}`;
};

matrix.addEventListener('click', (e) => nudge(e, e.shiftKey ? -0.25 : 0.25));
matrix.addEventListener('contextmenu', (e) => nudge(e, -0.25));
matrix.addEventListener('mousemove', showValue);

// ---------- URL hash ----------
// Holds the settings that differ from the defaults plus the rules, so the
// address is always a link back to the current world.

const format = (arr) => [...arr].map((x) => round(x)).join(',');

let hashTimer;
const syncUrl = () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const entries = Object.entries(params).filter(
      ([key, value]) => value !== defaults[key],
    );
    entries.push(['a', format(attractions)], ['t', format(thresholds)]);
    const hash = entries.map(([key, value]) => `${key}=${value}`).join('&');
    history.replaceState(null, '', '#' + hash);
  }, 300);
};

const rulesChanged = () => {
  drawMatrix();
  syncUrl();
};

const readHash = () => {
  const hash = new URLSearchParams(location.hash.slice(1));
  Object.assign(params, defaults);
  for (const key in defaults) {
    const value = Number(hash.get(key));
    if (hash.has(key) && Number.isFinite(value)) params[key] = value;
  }
  resize();
  reset();

  const parse = (key) => (hash.get(key) ?? '').split(',').map(Number);
  const a = parse('a');
  const t = parse('t');
  const size = params.numColors ** 2;
  if (
    a.length === size &&
    t.length === size &&
    [...a, ...t].every(Number.isFinite)
  ) {
    attractions = new Float32Array(a);
    thresholds = new Float32Array(t);
    rulesChanged();
  } else randomizeRules();
};

// ---------- GUI ----------

const gui = new GUI();
gui.add({randomizeRules}, 'randomizeRules').name('new rules');
gui.add({reset}, 'reset').name('scatter particles');
gui.add(params, 'numParticles', 500, 20000, 500).onFinishChange(restart);
gui.add(params, 'numColors', 1, 16, 1).onFinishChange(restart);
gui.add(params, 'radius', 16, 128, 1).onFinishChange(() => {
  resize();
  syncUrl();
});
gui.add(params, 'friction', 0.5, 0.99, 0.01).onChange(syncUrl);
gui.add(params, 'force', 0.0001, 0.005, 0.0001).onChange(syncUrl);
gui.add(params, 'repulsion', 0, 3, 0.1).onChange(syncUrl);
gui.add(params, 'minThreshold', 0, 1, 0.01).onFinishChange(randomizeRules);
gui.add(params, 'maxThreshold', 0, 1, 0.01).onFinishChange(randomizeRules);
gui.add(params, 'trails', 0, 0.95, 0.01).onChange(syncUrl);
gui.addFolder('attractions').$children.append(matrix);

window.addEventListener('hashchange', () => {
  readHash();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
});
window.addEventListener('resize', resize);

readHash();
loop();
