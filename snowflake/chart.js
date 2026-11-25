// The weather chart: temperature across, supersaturation over ice up, shaded
// by what grows where, with the line air in a cloud sits near (water
// saturation). Drag on it to draw the path the crystal grows along, or click to hold
// one spot. A dot shows where along the path the crystal is.

import {
  LABELS,
  SIGMA_MAX,
  T_MIN,
  plateness,
  waterSaturation,
  wetness,
} from './habits.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {(path: {T: number, sigma: number}[]) => void} onPath called with a new path
 */
export const makeChart = (canvas, onPath) => {
  const ctx = canvas.getContext('2d');
  let path = [{T: -15, sigma: 0.16}];
  let drawing = null;
  let lengths = [0];
  let shading = null;

  const size = () => {
    const dpr = devicePixelRatio;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      shading = null;
    }
    return {w, h, dpr};
  };
  const pad = () => 18 * devicePixelRatio;
  const toPx = ({T, sigma}, w, h) => [
    pad() * 1.5 + (T / T_MIN) * (w - pad() * 2),
    h - pad() - (sigma / SIGMA_MAX) * (h - pad() * 1.6),
  ];
  const fromPx = (x, y, w, h) => ({
    T: Math.min(
      0,
      Math.max(T_MIN, ((x - pad() * 1.5) / (w - pad() * 2)) * T_MIN),
    ),
    sigma:
      SIGMA_MAX * Math.min(1, Math.max(0, (h - pad() - y) / (h - pad() * 1.6))),
  });
  /** Distance on the chart, with both axes running 0 to 1 */
  const apart = (a, b) =>
    Math.hypot((a.T - b.T) / T_MIN, (a.sigma - b.sigma) / SIGMA_MAX);

  const measure = () => {
    lengths = [0];
    for (let k = 1; k < path.length; k++)
      lengths.push(lengths[k - 1] + apart(path[k], path[k - 1]));
  };

  /** Temperature and humidity at a fraction u of the way along the path */
  const at = (u) => {
    if (path.length === 1) return path[0];
    const total = lengths.at(-1);
    const target = Math.min(1, Math.max(0, u)) * total;
    let k = 1;
    while (k < path.length - 1 && lengths[k] < target) k++;
    const span = lengths[k] - lengths[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - lengths[k - 1]) / span));
    return {
      T: path[k - 1].T + (path[k].T - path[k - 1].T) * t,
      sigma: path[k - 1].sigma + (path[k].sigma - path[k - 1].sigma) * t,
    };
  };

  const makeShading = (w, h) => {
    const image = ctx.createImageData(w, h);
    for (let x = 0; x < w; x++) {
      const {T} = fromPx(x, 0, w, h);
      const P = plateness(T);
      for (let y = 0; y < h; y++) {
        const k = (y * w + x) * 4;
        const glow = 0.3 + 0.7 * wetness(fromPx(x, y, w, h));
        // plates warm, columns cool
        image.data[k] = (40 + 50 * Math.max(0, P)) * glow;
        image.data[k + 1] = (40 + 15 * Math.abs(P)) * glow;
        image.data[k + 2] = (55 + 60 * Math.max(0, -P)) * glow;
        image.data[k + 3] = 255;
      }
    }
    return image;
  };

  const draw = (u) => {
    const {w, h, dpr} = size();
    if (!w || !h) return;
    shading ??= makeShading(w, h);
    ctx.putImageData(shading, 0, 0);
    ctx.font = `${10 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff8';
    for (const [text, T, sigma] of LABELS) {
      const [x, y] = toPx({T, sigma}, w, h);
      ctx.fillText(text, x, y);
    }
    // water saturation: clouds sit near it, and only labs go far past it
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = '#9cf8';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    for (let T = 0; T >= T_MIN; T -= 0.5)
      ctx.lineTo(...toPx({T, sigma: waterSaturation(T)}, w, h));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    const [ax, ay] = toPx({T: -19, sigma: waterSaturation(-19)}, w, h);
    const [bx, by] = toPx({T: -23, sigma: waterSaturation(-23)}, w, h);
    ctx.translate((ax + bx) / 2, (ay + by) / 2);
    ctx.rotate(Math.atan2(by - ay, bx - ax));
    ctx.fillStyle = '#9cfb';
    ctx.textBaseline = 'bottom';
    ctx.fillText('water saturation', 0, -2 * dpr);
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff6';
    ctx.fillText('drag to draw the weather', w - 6 * dpr, 10 * dpr);
    ctx.textAlign = 'center';
    // axes
    ctx.fillStyle = '#fffa';
    ctx.textBaseline = 'bottom';
    for (const T of [0, -10, -20, -30]) {
      const [x] = toPx({T, sigma: 0}, w, h);
      ctx.fillText(`${T}°C`, Math.min(w - 14 * dpr, x), h - 2 * dpr);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const sigma of [0.1, 0.2, 0.3]) {
      const [, y] = toPx({T: 0, sigma}, w, h);
      ctx.fillText(`${sigma * 100}%`, 3 * dpr, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('↑ supersaturation over ice', w * 0.42, 14 * dpr);

    // the path, bright where the crystal has been
    const pts = (drawing ?? path).map((p) => toPx(p, w, h));
    const here = drawing ? null : toPx(at(u), w, h);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = '#fff6';
    ctx.beginPath();
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.stroke();
    if (here && path.length > 1) {
      const target = u * lengths.at(-1);
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      for (let k = 0; k < pts.length && lengths[k] <= target; k++)
        ctx.lineTo(...pts[k]);
      ctx.lineTo(...here);
      ctx.stroke();
    }
    if (pts.length) {
      ctx.fillStyle = '#fff8';
      ctx.beginPath();
      ctx.arc(...pts[0], 3 * dpr, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (here) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000a';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(...here, 5 * dpr, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  };

  const pointAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const {w, h, dpr} = size();
    return fromPx(
      (e.clientX - rect.left) * dpr,
      (e.clientY - rect.top) * dpr,
      w,
      h,
    );
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drawing = [pointAt(e)];
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pointAt(e);
    const last = drawing.at(-1);
    if (apart(p, last) > 0.01) drawing.push(p);
  });
  const finish = () => {
    if (!drawing) return;
    path = drawing;
    drawing = null;
    measure();
    onPath(path);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  return {
    draw,
    at,
    get path() {
      return path;
    },
    set path(p) {
      path = p;
      measure();
    },
  };
};
