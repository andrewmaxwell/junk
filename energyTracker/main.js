import {getData} from './getData.js';
import {smoothLine} from './smoothLine.js';

const graphs = [
  {key: 'overall', color: 'white'},
  {key: 'energy', color: 'yellow'},
  {key: 'anxiety', color: 'magenta'},
  {key: 'headache', color: 'red'},
  {key: 'mood', color: 'green'},
  {key: 'exercise', color: 'cyan'},
  {key: 'temperature', color: 'orange'},
  {key: 'precipitation', color: 'blue'},
  {key: 'pressure', color: 'black'},
];

const canvasWidth = 5000;
const margin = 4;
const canvasHeight = innerHeight / graphs.length - margin;

const addChart = ({data, key, color, i, minX, maxX}) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.borderBottom = `${margin}px solid black`;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const ob of data) {
    const val = ob[key];
    if (isNaN(val)) continue;
    minY = Math.min(minY, val);
    maxY = Math.max(maxY, val);
  }

  console.log(key, minY, maxY);

  const coords = data.map((ob) => ({
    x: ((ob.time - minX) / (maxX - minX)) * canvas.width,
    y: (1 - (ob[key] - minY) / (maxY - minY)) * canvasHeight,
    ob,
  }));

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const {x, y} of smoothLine(coords)) ctx.lineTo(x, y);
  ctx.lineTo(canvas.width, canvasHeight);
  ctx.lineTo(0, canvasHeight);
  ctx.fill();

  const label = document.createElement('div');
  label.innerText = key;
  Object.assign(label.style, {
    position: 'fixed',
    top: i * (canvasHeight + margin) + 'px',
    left: '3px',
  });
  document.body.append(canvas, label);

  canvas.addEventListener('mousemove', (e) => {
    let minDist = Infinity;
    let closest;
    for (const {x, ob} of coords) {
      const d = Math.abs(x - e.pageX);
      if (d < minDist) {
        minDist = d;
        closest = ob;
      }
    }

    canvas.title = [
      closest.tstamp,
      ...graphs.map(({key}) => `${key}: ${closest[key]}`),
      closest.notes ? `Notes: ${closest.notes}` : '',
    ]
      .join('\n')
      .trim();
  });
};

const data = await getData();

const minX = data[0].time;
const maxX = data[data.length - 1].time;

for (let i = 0; i < graphs.length; i++) {
  const {key, color} = graphs[i];
  addChart({data, key, color, i, minX, maxX});
}
