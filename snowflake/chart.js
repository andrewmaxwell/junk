// The weather chart: temperature across, humidity up, shaded by what grows
// where. Drag on it to draw the path the crystal grows along, or click to hold
// one spot. A dot shows where along the path the crystal is.

import {LABELS, T_MIN, plateness} from './habits.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {(path: {T: number, s: number}[]) => void} onPath called with a new path
 */
export const makeChart = (canvas, onPath) => {
  const ctx = canvas.getContext('2d');
  let path = [{T: -15, s: 0.85}];
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
  const toPx = ({T, s}, w, h) => [
    pad() + (T / T_MIN) * (w - pad() * 1.4),
    h - pad() - s * (h - pad() * 1.6),
  ];
  const fromPx = (x, y, w, h) => ({
    T: Math.min(0, Math.max(T_MIN, ((x - pad()) / (w - pad() * 1.4)) * T_MIN)),
    s: Math.min(1, Math.max(0, (h - pad() - y) / (h - pad() * 1.6))),
  });

  const measure = () => {
    lengths = [0];
    for (let k = 1; k < path.length; k++)
      lengths.push(
        lengths[k - 1] +
          Math.hypot(
            (path[k].T - path[k - 1].T) / -T_MIN,
            path[k].s - path[k - 1].s,
          ),
      );
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
      s: path[k - 1].s + (path[k].s - path[k - 1].s) * t,
    };
  };

  const makeShading = (w, h) => {
    const image = ctx.createImageData(w, h);
    for (let x = 0; x < w; x++) {
      const {T} = fromPx(x, 0, w, h);
      const P = plateness(T);
      for (let y = 0; y < h; y++) {
        const {s} = fromPx(x, y, w, h);
        const k = (y * w + x) * 4;
        const glow = 0.35 + 0.65 * s;
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
    for (const [text, T, s] of LABELS) {
      const [x, y] = toPx({T, s}, w, h);
      ctx.fillText(text, x, y);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff6';
    ctx.fillText('drag to draw a path', w - 6 * dpr, 10 * dpr);
    ctx.textAlign = 'center';
    // axes
    ctx.fillStyle = '#fffa';
    ctx.textBaseline = 'bottom';
    for (const T of [0, -10, -20, -30]) {
      const [x] = toPx({T, s: 0}, w, h);
      ctx.fillText(`${T}°C`, Math.min(w - 14 * dpr, x), h - 2 * dpr);
    }
    ctx.save();
    ctx.translate(10 * dpr, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('humidity →', 0, 4 * dpr);
    ctx.restore();

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
    if (Math.hypot((p.T - last.T) / -T_MIN, p.s - last.s) > 0.01)
      drawing.push(p);
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
