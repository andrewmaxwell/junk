import {SimulatedAnnealingSolver} from './solver.js';
import './utils.js';

console.clear();

const defaultMap = 'Random';
const defaultNumPts = 300;
const coolingFactor = 1 - 1 / 5e5;
const initialTemperature = 2;
const iterationsPerFrame = 1000;

const solver = new SimulatedAnnealingSolver({
  initialTemperature,
  coolingFactor, // the temperature is multiplied by this number every iteration
  getCost: path => {
    var cost = path[0].costs[path[path.length - 1].id];
    for (var i = 1; i < path.length; i++) {
      cost += path[i].costs[path[i - 1].id];
    }
    return cost;
  },
  generateNeighbor: currentPath => {
    // reverses a random subset of the path
    var newPath = currentPath.slice(0);
    var n = Math.floor(Math.random() * currentPath.length);
    var m = Math.floor(Math.random() * currentPath.length);
    var start = Math.min(n, m);
    var end = Math.max(n, m);
    while (start < end) {
      newPath[start] = currentPath[end];
      newPath[end] = currentPath[start];
      start++;
      end--;
    }
    return newPath;
  }
});

const maps = {
  Random: () => ({x: Math.random(), y: Math.random()}),
  Pseudorandom: i => ({
    x: ((Math.sin(i * 34224.432) + 1) * 324.3484) % 1,
    y: ((Math.sin(i * 53.196) + 1) * 2312.234692) % 1
  }),
  Spiral: i => ({
    x: 0.5 + i * 0.5 * Math.cos(i * 1000),
    y: 0.5 + i * 0.5 * Math.sin(i * 1000)
  }),
  Lines: i => ({x: (i * 17) % 1, y: i}),
  Flower: i => {
    const a = i * Math.PI * 2;
    const d = 0.3 + 0.2 * Math.cos(i * Math.PI * 20);
    return {x: 0.5 + d * Math.cos(a), y: 0.5 + d * Math.sin(a)};
  },
  Sine: i => ({x: i, y: Math.cos(i * Math.PI * 7) * 0.5 + 0.5}),
  Circle: i => ({
    x: 0.5 + 0.5 * Math.cos(i * Math.PI * 2),
    y: 0.5 + 0.5 * Math.sin(i * Math.PI * 2)
  }),
  Nautilus: i => {
    const a = i * Math.PI * 4;
    const d = 0.5 * i - 0.02 * (Math.sin(i * 300) + 1);
    return {x: 0.5 + d * Math.cos(a), y: 0.5 + d * Math.sin(a)};
  },
  'Grid (use square #)': (i, numPts) => {
    const rows = Math.sqrt(numPts);
    return {
      x: 0.5 / rows + (((i * numPts) / rows) % 1),
      y: 0.5 / rows + Math.floor((i * numPts) / rows) / rows
    };
  }
};

const initSolve = (mapName, numPts) => {
  const mapFunc = maps[mapName];
  const path = [];

  // build the path using mapFunc and precalculate distances
  for (let i = 0; i < numPts; i++) {
    let n1 = (path[i] = mapFunc(i / numPts, numPts));
    n1.id = i;
    n1.costs = new Float32Array(numPts);
    for (let j = 0; j < i; j++) {
      let n2 = path[j];
      let dx = n1.x - n2.x;
      let dy = n1.y - n2.y;
      n1.costs[n2.id] = n2.costs[n1.id] = Math.sqrt(dx * dx + dy * dy);
    }
  }

  console.log('path', path);

  solver.init(path.shuffle());
  log.length = 0;
};

const canvas = document.getElementById('C');
const log = [];

const loop = () => {
  requestAnimationFrame(loop);

  // if (solver.temperature < 1 - coolingFactor) return;

  for (let i = 0; i < iterationsPerFrame; i++) solver.iterate();
  log.push(solver.currentCost);

  let W = window.innerWidth;
  let H = window.innerHeight;
  const T = canvas.getContext('2d');

  T.clearRect(0, 0, W, H);

  T.globalAlpha = 1;
  T.fillStyle = '#CCF';
  T.beginPath();
  log.forEach((cost, i) =>
    T.lineTo((i / log.length) * W, H - (H * cost) / solver.maxCost)
  );
  T.lineTo(W, H);
  T.lineTo(0, H);
  T.fill();

  T.font = '15px monospace';
  T.fillStyle = 'black';
  T.fillText('Length: ' + solver.currentCost, 5, H - 40);
  T.fillText('Temperature: ' + solver.temperature, 5, H - 25);
  T.fillText('Frames: ' + log.length, 5, H - 10);

  T.fillStyle = 'rgba(0,0,0,0.2)';
  T.lineWidth = 0.5;
  T.beginPath();
  solver.currentState.forEach(p => T.lineTo(p.x * W, p.y * H));
  T.closePath();
  T.stroke();
  T.fill();

  // T.lineWidth = 0.3;
  // T.beginPath();
  // solver.bestState.forEach(p => T.lineTo(p.x * W, p.y * H));
  // T.stroke();
};

const {$} = window;
$(window)
  .on('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  })
  .trigger('resize');

$('#maps')
  .append(
    Object.keys(maps).map(m =>
      $('<option>')
        .val(m)
        .text(m)
    )
  )
  .val(defaultMap);

$('#numPts').val(defaultNumPts);

let looping = false;
$('form')
  .on('submit', e => {
    e.preventDefault();
    const mapName = $('#maps').val();
    const numPts = parseFloat($('#numPts').val());
    initSolve(mapName, numPts);
    if (!looping) {
      looping = true;
      loop();
    }
  })
  .submit();
