import { FACTOR_LABELS } from './comfort.js';

const WIDTH = 640;
const HEIGHT = 160;
// There used to be a gold "sunshine" strip in its own lane above the plot. It
// was cut, not because it looked bad, but because it was the night wash again:
// both were `brightness(point)`, one drawn as `1 - lit` and the other as
// `lit ** 2`. The wash is continuous, so it already separates a brilliant noon
// from a black thunderstorm afternoon — which was the strip's entire stated
// reason to exist. One variable, one encoding, one legend entry, and the plot
// gets the lane back.
const PLOT_TOP = 12;
const PLOT_BOTTOM = 150;
const HOUR_MS = 60 * 60 * 1000;

const GOOD_THRESHOLD = 70; // matches comfortHeadline's "Good for a walk"

const RAIN_COLOR = '#6FA9E0';
const RAIN_MIN_OPACITY = 0.06;
const RAIN_MAX_OPACITY = 0.28;
const RAIN_SCALE = 4; // mm/hr

const yFor = (score) => PLOT_BOTTOM - (score / 100) * (PLOT_BOTTOM - PLOT_TOP);
const round = (n) => n.toFixed(1);
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function rainOpacity(ratePerHour) {
  if (!(ratePerHour > 0)) return 0;
  return RAIN_MIN_OPACITY + (RAIN_MAX_OPACITY - RAIN_MIN_OPACITY) * (1 - Math.exp(-ratePerHour / RAIN_SCALE));
}

// --- Sky brightness ---------------------------------------------------------

// Night used to be a flat rectangle wherever `is_day` was 0, which answered
// "is the sun up" and nothing else — a brilliant June noon and a black
// thunderstorm afternoon drew identically. Shortwave radiation is already
// fetched for the thermal model and says how much light is actually landing,
// so the backdrop can show it.
//
// The square root is deliberate: linear W/m² spends almost all its range on the
// difference between bright and very bright, and almost none on dawn, which is
// the part you are looking for when you scan the chart for a walkable hour.
const FULL_SUN = 800; // W/m², about a clear summer noon
const TWILIGHT_FLOOR = 0.12; // the dimmest daylight still reads as daytime

function brightness(point) {
  if (point.is_day === 0) return 0;
  const lit = clamp01(Math.sqrt(Math.max(0, point.shortwave_radiation ?? 0) / FULL_SUN));
  return TWILIGHT_FLOOR + (1 - TWILIGHT_FLOOR) * lit;
}

// Behind the plot, darkness says how far from daylight it is — the old night
// band, now continuous, so dawn and dusk ramp instead of snapping.
const NIGHT_FILL = 'oklch(0.11 0.02 260)';
// Ten days of it makes a strong vertical stripe every 24 hours, which at this
// density competes with the score line for the reader's attention. Enough to
// read as night, not enough to be the first thing you see.
const NIGHT_MAX_OPACITY = 0.5;

// One gradient-filled rect per channel rather than a rect per hour: per-hour
// rects seam visibly where they abut, and a gradient interpolates dawn and dusk
// for free instead of stepping through them.
function skyWash(points, xScale, { id, fill, top, height, radius = 0, opacityFor }) {
  const stops = points
    .map((point) => {
      const offset = clamp01(xScale(point.time.getTime()) / WIDTH) * 100;
      return `<stop offset="${offset.toFixed(3)}%" stop-color="${fill}" stop-opacity="${opacityFor(brightness(point)).toFixed(3)}" />`;
    })
    .join('');

  return (
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>` +
    `<rect x="0" y="${top}" width="${WIDTH}" height="${height}" fill="url(#${id})" rx="${radius}" />`
  );
}

const nightWash = (points, xScale) =>
  skyWash(points, xScale, {
    id: 'sky-night',
    fill: NIGHT_FILL,
    top: PLOT_TOP,
    height: PLOT_BOTTOM - PLOT_TOP,
    opacityFor: (lit) => (1 - lit) * NIGHT_MAX_OPACITY,
  });

// Each hourly reading owns the half hour either side of its timestamp, so bands
// line up with the sample rather than trailing it.
function bandEdges(point, xScale) {
  const left = Math.max(0, xScale(point.time.getTime() - HOUR_MS / 2));
  const right = Math.min(WIDTH, xScale(point.time.getTime() + HOUR_MS / 2));
  return { left, width: Math.max(0, right - left) };
}

function rect(left, width, fill, opacity) {
  return `<rect x="${round(left)}" y="${PLOT_TOP}" width="${round(width)}" height="${PLOT_BOTTOM - PLOT_TOP}" fill="${fill}" opacity="${opacity.toFixed(3)}" />`;
}

function rainBands(points, xScale) {
  let svg = '';
  for (const point of points) {
    const opacity = rainOpacity(point.rate);
    if (opacity > 0) {
      const { left, width } = bandEdges(point, xScale);
      svg += rect(left, width, RAIN_COLOR, opacity);
    }
  }
  return svg;
}

// The window starts three days back from the current *hour*, so its first
// calendar day is a stub of a few hours. Labelling it printed a weekday on a
// sliver too narrow to hold one, which on a phone collided with the next day's.
const MIN_LABELLED_HOURS = 8;

// Groups points by calendar day for the boundary lines and the day-label row.
function buildDayGroups(points, xScale) {
  const groups = [];
  for (const point of points) {
    const key = point.time.toDateString();
    if (groups.at(-1)?.key !== key) groups.push({ key, points: [] });
    groups.at(-1).points.push(point);
  }

  return groups.map((group) => ({
    label:
      group.points.length >= MIN_LABELLED_HOURS
        ? group.points[0].time.toLocaleDateString(undefined, { weekday: 'short' })
        : null,
    x0: Math.max(0, xScale(group.points[0].time.getTime() - HOUR_MS / 2)),
    x1: Math.min(WIDTH, xScale(group.points.at(-1).time.getTime() + HOUR_MS / 2)),
  }));
}

function polylineFor(points, xScale) {
  return points.map((p) => `${round(xScale(p.time.getTime()))},${round(yFor(p.score))}`).join(' ');
}

// The ensemble band, drawn as one closed shape: out along the optimistic edge
// and back along the pessimistic one. Near-term it collapses to the width of
// the line and disappears; by day six it is visibly wider than the forecast is
// worth trusting, which is the point.
function uncertaintyBand(points, xScale) {
  const banded = points.filter((p) => p.band);
  if (banded.length < 2) return '';

  const high = banded.map((p) => `${round(xScale(p.time.getTime()))},${round(yFor(p.band[1]))}`);
  const low = banded
    .slice()
    .reverse()
    .map((p) => `${round(xScale(p.time.getTime()))},${round(yFor(p.band[0]))}`);

  return `<path d="M${high.join(' L')} L${low.join(' L')} Z" fill="var(--accent)" opacity="0.16" />`;
}

// The window the card recommends, drawn where it happens. Two features that
// name the same hour should not make you find it twice.
function bestWindowMarker(window, xScale, minTime, maxTime) {
  if (!window) return '';
  const start = Math.max(minTime, window.start.getTime());
  const end = Math.min(maxTime, window.end.getTime());
  if (end <= start) return '';
  const left = xScale(start);
  const width = Math.max(3, xScale(end) - left);
  const mid = left + width / 2;
  // An hour is about five pixels across ten days, so the column alone cannot be
  // seen. The caret is what you actually spot; the column is what you land on.
  return (
    `<rect x="${round(left)}" y="${PLOT_TOP}" width="${round(width)}" height="${PLOT_BOTTOM - PLOT_TOP}" ` +
    `fill="var(--accent)" fill-opacity="0.1" />` +
    `<path d="M${round(mid - 4)},${PLOT_TOP - 6} L${round(mid + 4)},${PLOT_TOP - 6} L${round(mid)},${PLOT_TOP - 1} Z" ` +
    `fill="var(--accent)" fill-opacity="0.9" />`
  );
}

// Renders the comfort timeline into `svgEl`, the day-label row into `dayRowEl`,
// and wires `tipEl` as a hover readout.
// `points`: [{ time, score, otherScore, rate, is_day, shortwave_radiation,
// temperature_2m, limiter, band? }] ascending. `score` is for the selected
// activity and `otherScore` for the other one. `band` is an optional
// [low, high] pair of plausible scores for that hour.
export function renderComfortChart(
  svgEl,
  dayRowEl,
  tipEl,
  legendEl,
  points,
  { now, bestWindow, activity, otherActivity },
) {
  const scored = points.filter((p) => Number.isFinite(p.score));
  if (scored.length < 2) {
    svgEl.innerHTML = '';
    dayRowEl.innerHTML = '';
    legendEl.innerHTML = '';
    return;
  }

  const minTime = scored[0].time.getTime();
  const maxTime = scored.at(-1).time.getTime();
  const span = maxTime - minTime || 1;
  const xScale = (t) => ((t - minTime) / span) * WIDTH;

  const days = buildDayGroups(scored, xScale);
  const nowX = Math.min(WIDTH, Math.max(0, xScale(now.getTime())));

  // Past and future are drawn as separate polylines: what already happened is
  // context, what's coming is the part you can act on.
  const pastPoints = scored.filter((p) => p.time.getTime() <= now.getTime());
  const futurePoints = scored.filter((p) => p.time.getTime() >= now.getTime());

  const boundaries = days
    .slice(1)
    .map((d) => `<line x1="${round(d.x0)}" y1="${PLOT_TOP}" x2="${round(d.x0)}" y2="${PLOT_BOTTOM}" stroke="var(--border)" stroke-width="1" />`)
    .join('');

  const goodY = round(yFor(GOOD_THRESHOLD));
  const refLine =
    `<line x1="0" y1="${goodY}" x2="${WIDTH}" y2="${goodY}" stroke="var(--ref-line)" stroke-width="1" stroke-dasharray="3 5" />` +
    `<text x="4" y="${yFor(GOOD_THRESHOLD) - 5}" class="chart-ref-label">GOOD</text>`;

  const futureLine = polylineFor(futurePoints, xScale);

  // The activity you did *not* pick, drawn faintly underneath. It is the whole
  // reason to have two activities: on a hot bright afternoon the walking line
  // dives and the sitting one does not, and that gap is the useful thing on the
  // chart. Which of the two is bold follows the toggle, so the emphasis always
  // matches the score in the ring.
  const otherLine = scored.every((p) => Number.isFinite(p.otherScore))
    ? `<polyline points="${scored.map((p) => `${round(xScale(p.time.getTime()))},${round(yFor(p.otherScore))}`).join(' ')}" ` +
      `fill="none" stroke="var(--alt-line)" stroke-width="1.3" stroke-opacity="0.5" stroke-linecap="round" stroke-linejoin="round" />`
    : '';

  svgEl.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svgEl.innerHTML =
    nightWash(scored, xScale) +
    rainBands(scored, xScale) +
    boundaries +
    refLine +
    bestWindowMarker(bestWindow, xScale, minTime, maxTime) +
    uncertaintyBand(futurePoints, xScale) +
    otherLine +
    `<polyline points="${polylineFor(pastPoints, xScale)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round" />` +
    `<polyline points="${futureLine}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />` +
    `<line x1="${round(nowX)}" y1="${PLOT_TOP - 4}" x2="${round(nowX)}" y2="${PLOT_BOTTOM}" stroke="var(--text)" stroke-width="1" stroke-opacity="0.45" />` +
    `<circle cx="${round(nowX)}" cy="${round(yFor(pastPoints.at(-1)?.score ?? scored[0].score))}" r="4" fill="var(--accent)" />` +
    `<line class="chart-cursor" x1="0" y1="${PLOT_TOP}" x2="0" y2="${PLOT_BOTTOM}" stroke="var(--text)" stroke-width="1" stroke-opacity="0.35" visibility="hidden" />`;

  dayRowEl.innerHTML = days
    .filter((d) => d.label)
    .map((d) => {
      const midPercent = (((d.x0 + d.x1) / 2) / WIDTH) * 100;
      return `<div class="day-cell" style="left:${midPercent.toFixed(2)}%"><span class="day-label">${d.label}</span></div>`;
    })
    .join('');

  legendEl.innerHTML = legend(activity, otherActivity, scored, bestWindow);

  attachHover(svgEl, tipEl, scored, xScale, activity, otherActivity);
}

// --- Legend -----------------------------------------------------------------
//
// Six things are drawn in this chart and until now exactly none of them said
// what they were. The teal line's only explanation was a dash swatch in a
// caption two hundred pixels away, and the blue columns, the dark wash, the
// gold strip and the translucent cone had no explanation anywhere — leaving a
// reader to reverse-engineer the chart before they could read it.
//
// Entries that describe something not currently on screen are dropped rather
// than listed and greyed: a legend for a dry week should not be teaching you
// what the rain shading looks like.
const swatch = {
  line: (color, opacity = 1) =>
    `<svg width="16" height="8" aria-hidden="true"><line x1="0" y1="4" x2="16" y2="4" stroke="${color}" ` +
    `stroke-width="2" stroke-opacity="${opacity}" stroke-linecap="round"/></svg>`,
  // Outlined, because the night swatch is very nearly the colour of the card it
  // sits on and without an edge there is nothing there to see.
  block: (fill, opacity) =>
    `<svg width="10" height="10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" rx="2" ` +
    `fill="${fill}" fill-opacity="${opacity}" stroke="var(--border-soft)"/></svg>`,
  caret: () =>
    `<svg width="10" height="10" aria-hidden="true"><path d="M1,3 L9,3 L5,8 Z" fill="var(--accent)" fill-opacity="0.9"/></svg>`,
};

function legend(activity, otherActivity, points, bestWindow) {
  const entries = [
    [swatch.line('var(--accent)'), activity.label],
    [swatch.line('var(--alt-line)', 0.5), otherActivity.label],
  ];

  if (points.some((p) => p.band && p.band[0] !== p.band[1])) {
    entries.push([swatch.block('var(--accent)', 0.16), 'Forecast range']);
  }
  if (points.some((p) => p.rate > 0)) entries.push([swatch.block(RAIN_COLOR, 0.28), 'Rain']);
  if (points.some((p) => brightness(p) < 1)) entries.push([swatch.block(NIGHT_FILL, 1), 'Night']);
  if (bestWindow) entries.push([swatch.caret(), 'Best window']);

  return entries
    .map(([mark, label]) => `<span class="legend-item">${mark}${label}</span>`)
    .join('');
}

// Assigned rather than added, so re-rendering never stacks up listeners.
function attachHover(svgEl, tipEl, points, xScale, activity, otherActivity) {
  const cursor = svgEl.querySelector('.chart-cursor');

  const show = (event) => {
    const box = svgEl.getBoundingClientRect();
    if (!box.width) return;
    const x = ((event.clientX - box.left) / box.width) * WIDTH;

    let nearest = points[0];
    for (const point of points) {
      if (Math.abs(xScale(point.time.getTime()) - x) < Math.abs(xScale(nearest.time.getTime()) - x)) {
        nearest = point;
      }
    }

    const pointX = xScale(nearest.time.getTime());
    cursor.setAttribute('x1', round(pointX));
    cursor.setAttribute('x2', round(pointX));
    cursor.setAttribute('visibility', 'visible');

    const when = nearest.time.toLocaleString(undefined, { weekday: 'short', hour: 'numeric' });
    // A collapsed band is the near-term case and says nothing; printing
    // "(86-86)" spends a third of the tooltip asserting there is no spread.
    const spread =
      nearest.band && nearest.band[0] !== nearest.band[1]
        ? ` (${nearest.band[0]}\u2013${nearest.band[1]})`
        : '';
    // The limiter is the most useful thing the chart knows and had nowhere to
    // say it: a dip you can see is a dip you still have to guess the cause of.
    const because = nearest.limiter
      ? ` · ${(FACTOR_LABELS[nearest.limiter] ?? nearest.limiter).toLowerCase()}`
      : '';
    const other = Number.isFinite(nearest.otherScore)
      ? ` · ${otherActivity.key} ${nearest.otherScore}`
      : '';
    tipEl.textContent =
      `${when} · ${activity.key} ${nearest.score}${spread}${other} · ` +
      `${Math.round(nearest.temperature_2m)}°${because}`;
    tipEl.style.left = `${((pointX / WIDTH) * 100).toFixed(2)}%`;
    tipEl.hidden = false;
  };

  const hide = () => {
    cursor.setAttribute('visibility', 'hidden');
    tipEl.hidden = true;
  };

  svgEl.onpointermove = show;
  svgEl.onpointerdown = show;
  svgEl.onpointerleave = hide;
}
