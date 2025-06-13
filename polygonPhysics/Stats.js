export class Stat {
  /**
   * @param {string} label
   * @param {string} color
   */
  constructor(label, color) {
    this.label = label;
    this.color = color;
    /** @type {Array<number>} */
    this.arr = [];
    this.max = -Infinity;
  }
  /** @param {number} val */
  push(val) {
    this.arr.push(val);
    this.max = Math.max(this.max, val);
  }
  /** @param {Stat} otherStat */
  syncMax(otherStat) {
    this.max = otherStat.max = Math.max(this.max, otherStat.max);
  }
}

// /** @type {(a: number, b: number, v: number) => number} */
// const interp = (a, b, v) => a * (1 - v) + b * v;

// /** @type {(arr: number[], i: number) => number} */
// const arrayInterp = (arr, i) =>
//   interp(arr[Math.floor(i)], arr[Math.floor(i) + 1], i % 1);

const statsWidth = 250;
const statsHeight = 75;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Stat[]} stats
 * */
export function drawStats(ctx, ...stats) {
  ctx.save();
  ctx.translate(innerWidth - statsWidth, innerHeight - statsHeight);

  for (let i = 0; i < stats.length; i++) {
    const {color, arr, label, max} = stats[i];
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = 0; x < statsWidth; x++) {
      const index = (x / statsWidth) * arr.length;
      const y = (1 - arr[Math.floor(index)] / max) * statsHeight;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    const tail = arr.slice(-100);
    const avg = Math.round(tail.reduce((a, b) => a + b) / tail.length);
    ctx.fillText(`${avg} ${label}`, 0, (stats.length - i - 1) * -10);
  }

  ctx.restore();
}

/** @type {(func: () => void) => number} */
export const timeFunc = (func) => {
  const start = performance.now();
  func();
  return performance.now() - start;
};
