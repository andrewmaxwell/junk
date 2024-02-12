import {getMonths} from './getMonths.js';
import {smoothLine} from './smoothLine.js';

const margin = 4;

export const addChart = ({data, key, color, i, minX, maxX, graphs}) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 6000;
  canvas.height = innerHeight / graphs.length - margin;
  canvas.style.borderBottom = `${margin}px solid black`;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const ob of data) {
    const val = ob[key];
    if (isNaN(val)) continue;
    minY = Math.min(minY, val);
    maxY = Math.max(maxY, val);
  }

  const toX = (time) => ((time - minX) / (maxX - minX)) * canvas.width;

  const coords = data.map((ob) => ({
    x: toX(ob.time),
    y: (1 - (ob[key] - minY) / (maxY - minY)) * canvas.height,
    ob,
  }));

  // curves
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const {x, y} of smoothLine(coords)) ctx.lineTo(x, y);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.fill();

  // month lines
  ctx.strokeStyle = ctx.fillStyle = 'white';
  ctx.beginPath();
  for (const date of getMonths(minX, maxX)) {
    const x = toX(date);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.fillText(
      date.getMonth() + 1 + '/' + (date.getFullYear() % 100),
      x + 2,
      canvas.height - 2
    );
  }
  ctx.stroke();

  // chart label
  const label = document.createElement('div');
  label.innerText = key;
  Object.assign(label.style, {
    position: 'fixed',
    top: i * (canvas.height + margin) + 'px',
    left: '3px',
  });
  document.querySelector('#container').append(canvas, label);

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
