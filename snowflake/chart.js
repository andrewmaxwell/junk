// The weather chart: temperature across, supersaturation over ice up, shaded
// by what grows where, with the line air in a cloud sits near (water
// saturation). Drag on it to draw the path the crystal grows along, or click to hold
// one spot. A dot shows where along the path the crystal is.

import {
  LABELS,
  SIGMA_MAX,
  T_MIN,
  habitAt,
  plateness,
  waterSaturation,
  wetness,
} from './habits.js';

/** Colors for the shading, in linear light: plates warm, columns cool */
const PLATES = [1, 0.3, 0.32];
const COLUMNS = [0.1, 0.45, 1];
const BETWEEN = [0.35, 0.3, 0.5];
/** Around the plot */
const FRAME = [10, 12, 20];
const toSrgb = (c) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A small picture of a habit, r across, centered at x, y */
const drawShape = (ctx, kind, x, y, r) => {
  const spoke = (a, from, to) => {
    ctx.moveTo(x + from * Math.cos(a), y + from * Math.sin(a));
    ctx.lineTo(x + to * Math.cos(a), y + to * Math.sin(a));
  };
  const hexagon = (size) => {
    for (let k = 0; k <= 6; k++)
      ctx.lineTo(
        x + size * Math.cos((k * Math.PI) / 3),
        y + size * Math.sin((k * Math.PI) / 3),
      );
  };
  ctx.beginPath();
  if (kind === 'plate' || kind === 'sectored') {
    hexagon(r);
    if (kind === 'sectored')
      for (let k = 0; k < 6; k++) spoke((k * Math.PI) / 3, 0, r);
  } else if (kind === 'column' || kind === 'needle') {
    const w = kind === 'column' ? r * 0.55 : r * 0.12;
    ctx.rect(x - w, y - r, 2 * w, 2 * r);
  } else {
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      spoke(a, 0, r);
      for (const along of kind === 'fern' ? [0.45, 0.75] : [0.6]) {
        const bx = x + along * r * Math.cos(a);
        const by = y + along * r * Math.sin(a);
        for (const side of [-1, 1]) {
          ctx.moveTo(bx, by);
          ctx.lineTo(
            bx + 0.3 * r * Math.cos(a + side),
            by + 0.3 * r * Math.sin(a + side),
          );
        }
      }
    }
  }
  ctx.stroke();
};

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
  /** The weather under the pointer, to name what grows there */
  let pointer = null;

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
  /** The plot's margins, in canvas pixels: room for the axes and a title */
  const box = (w, h) => {
    const dpr = devicePixelRatio;
    return {
      left: 30 * dpr,
      right: w - 8 * dpr,
      top: 22 * dpr,
      bottom: h - 18 * dpr,
    };
  };
  const toPx = ({T, sigma}, w, h) => {
    const b = box(w, h);
    return [
      b.left + (T / T_MIN) * (b.right - b.left),
      b.bottom - (sigma / SIGMA_MAX) * (b.bottom - b.top),
    ];
  };
  const fromPx = (x, y, w, h) => {
    const b = box(w, h);
    const clamp = (v) => Math.min(1, Math.max(0, v));
    return {
      T: T_MIN * clamp((x - b.left) / (b.right - b.left)),
      sigma: SIGMA_MAX * clamp((b.bottom - y) / (b.bottom - b.top)),
    };
  };
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

  /** The background: what grows where, brighter the wetter the air (past
      wetness 1, a little over water saturation, it's all the same) */
  const makeShading = (w, h) => {
    const image = ctx.createImageData(w, h);
    const b = box(w, h);
    for (let k = 0; k < w * h; k++) {
      image.data.set(FRAME, k * 4);
      image.data[k * 4 + 3] = 255;
    }
    for (let x = Math.ceil(b.left); x < b.right; x++) {
      const {T} = fromPx(x, 0, w, h);
      const P = plateness(T);
      const hue = P > 0 ? PLATES : COLUMNS;
      const t = Math.min(1, Math.abs(P) * 1.4);
      const color = BETWEEN.map((c, i) => c + (hue[i] - c) * t);
      for (let y = Math.ceil(b.top); y < b.bottom; y++) {
        const k = (y * w + x) * 4;
        const light = 0.012 + 0.16 * wetness(fromPx(x, y, w, h)) ** 1.5;
        for (let i = 0; i < 3; i++)
          image.data[k + i] = toSrgb(color[i] * light);
      }
    }
    return image;
  };

  const draw = (u) => {
    const {w, h, dpr} = size();
    if (!w || !h) return;
    shading ??= makeShading(w, h);
    ctx.putImageData(shading, 0, 0);
    const b = box(w, h);
    const font = (px, weight = 400) =>
      `${weight} ${px * dpr}px system-ui, sans-serif`;

    // grid
    ctx.strokeStyle = '#ffffff14';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (let T = -5; T > T_MIN; T -= 5) {
      const [x] = toPx({T, sigma: 0}, w, h);
      ctx.moveTo(x, b.top);
      ctx.lineTo(x, b.bottom);
    }
    for (const sigma of [0.1, 0.2, 0.3]) {
      const [, y] = toPx({T: 0, sigma}, w, h);
      ctx.moveTo(b.left, y);
      ctx.lineTo(b.right, y);
    }
    ctx.stroke();

    // what grows where
    ctx.font = font(10);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = dpr;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.shadowColor = '#000c';
    ctx.shadowBlur = 3 * dpr;
    for (const [text, T, sigma, kind] of LABELS) {
      const [x, y] = toPx({T, sigma}, w, h);
      ctx.strokeStyle = '#fffc';
      drawShape(ctx, kind, x, y, 4.5 * dpr);
      ctx.fillStyle = '#fffd';
      ctx.fillText(text, x + 8 * dpr, y);
    }
    ctx.shadowBlur = 0;

    // water saturation: air in a cloud sits near it
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.strokeStyle = '#a8d8ffaa';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    for (let T = 0; T >= T_MIN; T -= 0.5)
      ctx.lineTo(...toPx({T, sigma: waterSaturation(T)}, w, h));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    const [ax, ay] = toPx({T: -25.5, sigma: waterSaturation(-25.5)}, w, h);
    const [bx, by] = toPx({T: -29.5, sigma: waterSaturation(-29.5)}, w, h);
    ctx.translate((ax + bx) / 2, (ay + by) / 2);
    ctx.rotate(Math.atan2(by - ay, bx - ax));
    ctx.fillStyle = '#a8d8ffcc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = font(9);
    ctx.fillText('in a cloud', 0, -2 * dpr);
    ctx.restore();

    // axes
    ctx.font = font(10);
    ctx.fillStyle = '#fff9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const T of [0, -10, -20, -30]) {
      const [x] = toPx({T, sigma: 0}, w, h);
      ctx.fillText(
        `${T ? '−' + -T : 0}°C`,
        Math.min(b.right - 12 * dpr, Math.max(b.left + 8 * dpr, x)),
        b.bottom + 4 * dpr,
      );
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const sigma of [0.1, 0.2, 0.3]) {
      const [, y] = toPx({T: 0, sigma}, w, h);
      ctx.fillText(`${sigma * 100}%`, b.left - 5 * dpr, y);
    }

    // title, or what grows under the pointer
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const title = 11 * dpr;
    if (pointer) {
      const {T, sigma} = pointer;
      ctx.font = font(11, 600);
      ctx.fillStyle = '#fff';
      const name = habitAt(pointer);
      ctx.fillText(name, 8 * dpr, title);
      const after = ctx.measureText(name).width + 8 * dpr;
      ctx.font = font(11);
      ctx.fillStyle = '#fffa';
      ctx.fillText(
        `  ${T.toFixed(1).replace('-', '−')}°C, ${(sigma * 100).toFixed(1)}% over ice`,
        8 * dpr + after,
        title,
      );
    } else {
      ctx.font = font(11, 600);
      ctx.fillStyle = '#fff';
      ctx.fillText('Weather', 8 * dpr, title);
      ctx.font = font(11);
      ctx.fillStyle = '#fff9';
      ctx.textAlign = 'right';
      ctx.fillText(
        'drag to draw the path it falls through',
        w - 8 * dpr,
        title,
      );
    }

    // the path, bright where the crystal has been, with an arrow at its end
    const pts = (drawing ?? path).map((p) => toPx(p, w, h));
    const here = drawing ? null : toPx(at(u), w, h);
    ctx.lineCap = ctx.lineJoin = 'round';
    const line = (points, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * dpr;
      ctx.beginPath();
      points.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.stroke();
    };
    line(pts, '#0008', 4);
    line(pts, '#fff7', 2);
    if (here && path.length > 1) {
      const target = u * lengths.at(-1);
      const done = pts.filter((_, k) => lengths[k] <= target);
      line([...done, here], '#fff', 2);
    }
    if (pts.length > 1) {
      const [x, y] = pts.at(-1);
      const [px, py] =
        pts.findLast(([qx, qy]) => Math.hypot(qx - x, qy - y) > 6 * dpr) ??
        pts[0];
      const a = Math.atan2(y - py, x - px);
      const arm = 6 * dpr;
      ctx.fillStyle = '#fffc';
      ctx.beginPath();
      ctx.moveTo(x + 2 * dpr * Math.cos(a), y + 2 * dpr * Math.sin(a));
      ctx.lineTo(x - arm * Math.cos(a - 0.5), y - arm * Math.sin(a - 0.5));
      ctx.lineTo(x - arm * Math.cos(a + 0.5), y - arm * Math.sin(a + 0.5));
      ctx.fill();
    }
    if (pts.length) {
      ctx.fillStyle = '#fffa';
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
    pointer = pointAt(e);
    drawing = [pointer];
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointAt(e);
    pointer = p;
    if (!drawing) return;
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
  canvas.addEventListener('pointerup', (e) => {
    finish();
    // a finger lifted leaves no pointer hovering
    if (e.pointerType !== 'mouse') pointer = null;
  });
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('pointerleave', () => (pointer = null));

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
