import { getMonths } from './getMonths.js';
import { smootherLineGaussian } from './smoothLine.js';

/**
 * @typedef {Object} DataPoint
 * @property {number} time
 * @property {string} tstamp
 * @property {string} [notes]
 * @property {number} [energy]
 * @property {number} [anxiety]
 * @property {number} [headache]
 * @property {number} [mood]
 * @property {number} [exercise]
 * @property {number} [temperature]
 * @property {number} [precipitation]
 * @property {number} [pressure]
 */

/**
 * @typedef {Object} GraphSpec
 * @property {keyof DataPoint} key
 * @property {string} color
 */

/**
 * @typedef {Object} ChartOptions
 * @property {DataPoint[]} data
 * @property {keyof DataPoint} key
 * @property {string} color
 * @property {number} minX
 * @property {number} maxX
 * @property {GraphSpec[]} graphs
 * @property {number} margin
 * @property {number} width
 */

/**
 * @param {ChartOptions} options
 * @returns {HTMLCanvasElement}
 */
export const makeChart = ({
  data,
  key,
  color,
  minX,
  maxX,
  graphs,
  margin,
  width,
}) => {
  const canvas = document.createElement('canvas');
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  canvas.width = width;
  canvas.height = innerHeight / graphs.length - margin;
  canvas.style.borderBottom = `${margin}px solid black`;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const ob of data) {
    const val = Number(ob[key]);
    if (isNaN(val)) continue;
    minY = Math.min(minY, val);
    maxY = Math.max(maxY, val);
  }

  /** @param {number} time */
  const toX = (time) => ((time - minX) / (maxX - minX)) * canvas.width;

  /** @type {Array<{x: number, y: number, ob: DataPoint}>} */
  const coords = [];
  for (const ob of data) {
    const val = Number(ob[key]);
    if (isNaN(val)) continue;
    coords.push({
      x: toX(ob.time),
      y: (1 - (val - minY) / (maxY - minY)) * canvas.height,
      ob,
    });
  }

  // curves
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const {x, y} of coords) ctx.lineTo(x, y);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.fill();

  // month lines
  ctx.strokeStyle = ctx.fillStyle = 'white';
  ctx.beginPath();
  for (const date of getMonths(minX, maxX)) {
    const x = toX(date.getTime());
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.fillText(
      date.getMonth() + 1 + '/' + (date.getFullYear() % 100),
      x + 2,
      canvas.height - 2,
    );
  }
  ctx.stroke();

  // smoother curve
  ctx.beginPath();
  for (const {x, y} of smootherLineGaussian(coords, canvas.width, 32)) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  canvas.addEventListener('mousemove', (e) => {
    let minDist = Infinity;
    let closest = coords[0].ob;
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

  return canvas;
};
