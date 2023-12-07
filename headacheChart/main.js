import {
  calcFrequency,
  nextMonth,
  simpleMovingAverage,
  smooth,
} from './utils.js';

const dates = (await (await fetch('headaches.txt')).text())
  .split('\n')
  .map((d) => Date.parse(d));

const baseLine = innerHeight - 30;

const canvas = document.querySelector('canvas');
canvas.width = innerWidth;
canvas.height = innerHeight;
const ctx = canvas.getContext('2d');

const minDate = new Date(dates[0]);
const maxDate = dates[dates.length - 1];

const dateToX = (date) => ((date - minDate) / (maxDate - minDate)) * innerWidth;

const draw = (windowSize) => {
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  // draw dots
  for (const date of dates) {
    ctx.fillRect(dateToX(date), baseLine, 1, 10);
  }

  // vertical lines and months
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (
    let date = new Date(minDate.getFullYear(), minDate.getMonth());
    date < maxDate;
    date = nextMonth(date)
  ) {
    const x = dateToX(date);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, innerHeight - 20);
    ctx.fillText(
      date.getMonth() + 1 + '/' + (date.getFullYear() % 100),
      x,
      innerHeight - 5
    );
  }

  // calculations
  const roughPoints = calcFrequency(dates, windowSize, innerWidth);
  const smoothPoints = calcFrequency(
    dates,
    windowSize,
    innerWidth,
    (v) => 2 * (1 - Math.abs(v))
    // (v) => (Math.sqrt(1 - v * v) / Math.PI) * 4
  );
  const spacing = baseLine / (1.1 * Math.max(...roughPoints));

  // horizontal lines and counts
  ctx.textAlign = 'left';
  for (let i = 0; baseLine - i * spacing > 0; i++) {
    const y = baseLine - i * spacing;
    ctx.moveTo(0, y);
    ctx.lineTo(innerWidth, y);
    ctx.fillText(i, 7, y - 2);
  }
  ctx.stroke();

  // lines
  const drawLine = (points, color = 'black', lineWidth = 1) => {
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      ctx.lineTo(i, baseLine - points[i] * spacing);
    }
    ctx.stroke();
  };

  drawLine(roughPoints, 'rgba(0,0,0,0.1)', 4);
  drawLine(smoothPoints, 'blue', 2);
  // drawLine(simpleMovingAverage(roughPoints, 15), 'red');
};

draw(30 * 24 * 3600 * 1000);

// canvas.addEventListener('mousemove', ({offsetX}) => {
//   const days = offsetX / 5;
//   canvas.title = `${Math.round(days * 10) / 10} days`;
//   draw(days * 24 * 3600 * 1000);
// });
