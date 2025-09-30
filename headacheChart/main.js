import {calcFrequency, nextMonth} from './utils.js';

const twoYearsAgo = new Date();
twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

const dates = (await (await fetch('headaches.txt')).text())
  .split('\n')
  .map((d) => new Date(d))
  .filter((d) => d > twoYearsAgo);

const chartHeight = innerHeight - 30;

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
canvas.width = innerWidth;
canvas.height = innerHeight;
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

const minDate = new Date(dates[0]);
const maxDate = new Date(dates[dates.length - 1]);

/** @param {Date} date */
const dateToX = (date) =>
  ((date.getTime() - minDate.getTime()) /
    (maxDate.getTime() - minDate.getTime())) *
  innerWidth;

const draw = (windowSize) => {
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  // draw dots
  for (const date of dates) {
    ctx.fillRect(dateToX(date), chartHeight, 1, 10);
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
      innerHeight - 5,
    );
  }

  // calculations
  const roughPoints = calcFrequency(dates, windowSize, innerWidth);
  // const smoothPoints = calcFrequency(
  //   dates,
  //   windowSize,
  //   innerWidth,
  //   (v) => 2 * (1 - Math.abs(v)),
  //   // (v) => (Math.sqrt(1 - v * v) / Math.PI) * 4
  // );
  const spacing = chartHeight / (1.1 * Math.max(...roughPoints));

  // horizontal lines and counts
  ctx.textAlign = 'left';
  for (let i = 0; chartHeight - i * spacing > 0; i++) {
    const y = chartHeight - i * spacing;
    ctx.moveTo(0, y);
    ctx.lineTo(innerWidth, y);
    ctx.fillText(String(i), 7, y - 2);
  }
  ctx.stroke();

  // lines
  const drawLine = (points, color = 'black', lineWidth = 1) => {
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      ctx.lineTo(i, chartHeight - points[i] * spacing);
    }
    ctx.stroke();
  };

  drawLine(roughPoints, 'blue', 2);
  // drawLine(smoothPoints, 'blue', 2);

  // ctx.beginPath();
  // ctx.strokeStyle = 'green';
  // ctx.lineWidth = 1;
  // for (let i = 0; i < dates.length; i++) {
  //   const x = dateToX(dates[i]);
  //   const y = chartHeight * (1 - i / dates.length);
  //   ctx.lineTo(x, y);
  // }
  // ctx.stroke();
  // drawLine(simpleMovingAverage(roughPoints, 15), 'red');
};

draw(30 * 24 * 3600 * 1000);

// canvas.addEventListener('mousemove', ({offsetX}) => {
//   const days = offsetX / 5;
//   canvas.title = `${Math.round(days * 10) / 10} days`;
//   draw(days * 24 * 3600 * 1000);
// });
