// Faint ticks along the left edge (frequency) and the bottom (time), drawn on
// a transparent canvas over the picture. They say where you are and nothing
// more: no gridlines across the picture, and labels kept small and dim.

const COLOUR = 'rgba(232, 240, 255, 0.5)';
const FONT = '10px "Helvetica Neue", Helvetica, Arial, sans-serif';
const TICK = 5; // px

// Labels are kept clear of the controls in the top-left corner, and of each
// other where the two axes meet in the bottom-left one.
const TOP_CLEAR = 56;
const BOTTOM_CLEAR = 22;
const LEFT_CLEAR = 64;

// Ticks no closer than this, in CSS pixels.
const MIN_F_GAP = 30;
const MIN_T_GAP = 120;

// Narrower than this ratio, frequency ticks are evenly spaced.
const LINEAR_BELOW = 4;

// The smallest of 1, 2 and 5 times a power of ten that is at least `x`.
function nice(x) {
  const p = 10 ** Math.floor(Math.log10(x));

  for (const m of [1, 2, 5, 10]) {
    if (m * p >= x) return m * p;
  }

  return 10 * p;
}

// Decimals enough to tell ticks `step` apart.
const decimals = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

// Frequency ticks for a log axis. At the full view that is 100, 200, 500, 1k
// and so on, and the sets get denser as there is room.
function frequencyTicks(f0, f1, h) {
  const l0 = Math.log(f0);
  const span = Math.log(f1) - l0;
  const y = (f) => h * (1 - (Math.log(f) - l0) / span);

  let best = [];

  for (const set of [[1], [1, 2, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9]]) {
    const ticks = [];

    for (let p = 10 ** Math.floor(Math.log10(f0)); p <= f1; p *= 10) {
      for (const m of set) {
        const f = m * p;
        if (f >= f0 && f <= f1) ticks.push(f);
      }
    }

    const gap = Math.min(...ticks.slice(1).map((f, i) => y(ticks[i]) - y(f)));

    if (ticks.length < 2 || gap >= MIN_F_GAP) {
      best = ticks;
    }
  }

  // Inside two octaves the 1-2-5 sets leave most of the axis bare (688 to
  // 1454 Hz has nothing between 1k and 2k), and a log axis that narrow is
  // close enough to linear that even steps read naturally.
  if (best.length >= 3 && f1 / f0 >= LINEAR_BELOW) {
    return {ticks: best, step: null};
  }

  const step = nice(((f1 - f0) * MIN_F_GAP * 1.5) / h);
  const ticks = [];

  for (let f = Math.ceil(f0 / step) * step; f <= f1; f += step) {
    ticks.push(f);
  }

  return {ticks, step};
}

// Round values on the log ticks, in kHz above a thousand; plain hertz on the
// evenly spaced ones, where "1084.5" reads better than "1.0845k".
function frequencyLabel(f, step) {
  if (step) {
    return f.toFixed(decimals(step));
  }

  return f >= 1000 ? `${f / 1000}k` : `${f}`;
}

function timeTicks(t0, t1, w) {
  const step = nice(((t1 - t0) * MIN_T_GAP) / w);
  const ticks = [];

  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    ticks.push(t);
  }

  return {ticks, step};
}

function timeLabel(t, step) {
  return step >= 0.5
    ? `${t.toFixed(decimals(step))} s`
    : `${(t * 1000).toFixed(decimals(step * 1000))} ms`;
}

// `view` is {t0, t1} in seconds and {f0, f1} in Hz; null clears the axes.
export function drawAxes(canvas, view) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!view) {
    return;
  }

  ctx.strokeStyle = COLOUR;
  ctx.fillStyle = COLOUR;

  // A soft dark halo, so a label stays legible over a bright stretch of the
  // picture without needing a box behind it.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 3;
  ctx.font = FONT;
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const l0 = Math.log(view.f0);
  const lSpan = Math.log(view.f1) - l0;
  const {ticks: fTicks, step: fStep} = frequencyTicks(view.f0, view.f1, h);

  ctx.beginPath();

  for (const f of fTicks) {
    const y = Math.round(h * (1 - (Math.log(f) - l0) / lSpan)) + 0.5;

    ctx.moveTo(0, y);
    ctx.lineTo(TICK, y);

    if (y > TOP_CLEAR && y < h - BOTTOM_CLEAR) {
      ctx.fillText(frequencyLabel(f, fStep), TICK + 3, y);
    }
  }

  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'center';

  const {ticks: tTicks, step: tStep} = timeTicks(view.t0, view.t1, w);

  for (const t of tTicks) {
    const x = Math.round(((t - view.t0) / (view.t1 - view.t0)) * w) + 0.5;

    ctx.moveTo(x, h);
    ctx.lineTo(x, h - TICK);

    if (x > LEFT_CLEAR && x < w - 24) {
      ctx.fillText(timeLabel(t, tStep), x, h - TICK - 3);
    }
  }

  ctx.stroke();
}
