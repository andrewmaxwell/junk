// The two forecast pictures: the next 24 hours as a line, the next 10 days as
// low-to-high bars. Both plot feels-like, and both color it with the same
// temperature scale as the big outside number.

// Blue when cold, green when comfortable, amber and red when hot (°F felt).
const TEMPERATURE_STOPS = [
  [25, [110, 140, 235]],
  [40, [90, 165, 225]],
  [50, [93, 202, 165]],
  [62, [151, 196, 89]],
  [76, [239, 168, 69]],
  [90, [226, 75, 74]],
];

export function temperatureColor(felt) {
  const first = TEMPERATURE_STOPS[0];
  if (felt <= first[0]) return `rgb(${first[1]})`;
  for (let k = 1; k < TEMPERATURE_STOPS.length; k++) {
    const [b, cb] = TEMPERATURE_STOPS[k];
    if (felt <= b) {
      const [a, ca] = TEMPERATURE_STOPS[k - 1];
      const u = (felt - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * u))})`;
    }
  }
  return `rgb(${TEMPERATURE_STOPS.at(-1)[1]})`;
}

export const hourLabel = (date) => {
  const h = date.getHours();
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
};

// "2–11am", or "10pm–3am" across the period change.
export function hourRange(from, to) {
  const a = hourLabel(from);
  const b = hourLabel(to);
  return a.slice(-1) === b.slice(-1)
    ? `${a.slice(0, -1)}–${b}m`
    : `${a}m–${b}m`;
}

const NS = 'http://www.w3.org/2000/svg';

// Chances of rain or snow below this are left off both charts: a 20% that
// usually doesn't happen is just noise on an always-on screen.
const SHOW_CHANCE = 30;

function svgElement(parent, name, attributes, text) {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes))
    el.setAttribute(key, value);
  if (text != null) el.textContent = text;
  parent.appendChild(el);
  return el;
}

// Outlined text, so labels stay readable where they cross a rain bar.
const LABEL = {stroke: '#0d0e10', 'stroke-width': 3, 'paint-order': 'stroke'};

const DARK_SKY = [13, 14, 16];
const LIT_SKY = [44, 52, 64];
// Sunlight at which the sky shading tops out. A clear autumn noon is ~600 W/m²,
// summer ~900; capping here keeps a bright winter day from looking dim.
const FULL_SUN = 700;

const skyColor = (radiation) => {
  const b = Math.min(1, Math.max(0, radiation ?? 0) / FULL_SUN);
  return `rgb(${DARK_SKY.map((c, j) => Math.round(c + (LIT_SKY[j] - c) * b))})`;
};

// `hours` is [{time, felt, chance, radiation, snow}], first entry = now.
// `wet` is the run of likely rain or snow to label, or null.
export function drawHourly(svg, hours, wet) {
  svg.replaceChildren();
  const width = 360;
  const plotTop = 6;
  const plotBottom = 68;
  const n = hours.length;
  const step = (width - 12) / (n - 1);
  const x = (i) => 6 + i * step;

  const felts = hours.map((h) => h.felt);
  const min = Math.min(...felts) - 2;
  const max = Math.max(...felts) + 2;
  const y = (t) =>
    plotBottom - ((t - min) / (max - min)) * (plotBottom - plotTop);

  // One smooth wash rather than a stripe per hour, which read as a barcode.
  const defs = svgElement(svg, 'defs', {});
  const wash = svgElement(defs, 'linearGradient', {id: 'sky-wash'});
  hours.forEach((h, i) =>
    svgElement(wash, 'stop', {
      offset: x(i) / width,
      'stop-color': skyColor(h.radiation),
    }),
  );
  svgElement(svg, 'rect', {
    x: 0,
    y: 0,
    width,
    height: plotBottom,
    fill: 'url(#sky-wash)',
  });

  hours.forEach((h, i) => {
    if (h.chance < SHOW_CHANCE) return;
    const height = (h.chance / 100) * 34;
    svgElement(svg, 'rect', {
      x: x(i) - 3,
      y: plotBottom - height,
      width: 6,
      height,
      rx: 1.5,
      fill: h.snow ? '#c9d6ea' : '#3f78ba',
      opacity: 0.75,
    });
  });

  if (wet) {
    svgElement(
      svg,
      'text',
      {
        x: x((wet.from + wet.to) / 2),
        y: plotBottom - 38,
        'text-anchor': 'middle',
        'font-size': 11,
        fill: '#7fa9d8',
        ...LABEL,
      },
      wet.label,
    );
  }

  for (let i = 1; i < n; i++) {
    svgElement(svg, 'line', {
      x1: x(i - 1),
      y1: y(felts[i - 1]),
      x2: x(i),
      y2: y(felts[i]),
      stroke: temperatureColor((felts[i] + felts[i - 1]) / 2),
      'stroke-width': 3,
      'stroke-linecap': 'round',
    });
  }
  svgElement(svg, 'line', {
    x1: 0,
    y1: plotBottom,
    x2: width,
    y2: plotBottom,
    stroke: '#2a2c30',
    'stroke-width': 1,
  });

  // The high's label hangs under the line and the low's sits above it, in the
  // open space the curve leaves. Each label is measured, then pushed clear of
  // the line everywhere along its width, not just at the point it names.
  const hi = felts.indexOf(Math.max(...felts));
  const lo = felts.indexOf(Math.min(...felts));
  const lineY = (px) => {
    const t = Math.min(n - 1, Math.max(0, (px - 6) / step));
    const i = Math.floor(t);
    const f = felts[i] + (felts[Math.min(n - 1, i + 1)] - felts[i]) * (t - i);
    return y(f);
  };
  const GAP = 4;
  for (const [i, word, under] of [
    [hi, 'high', true],
    [lo, 'low', false],
  ]) {
    svgElement(svg, 'circle', {
      cx: x(i),
      cy: y(felts[i]),
      r: 3.5,
      fill: temperatureColor(felts[i]),
      stroke: '#0d0e10',
      'stroke-width': 2,
    });
    const when =
      i === 0 ? 'now' : hourLabel(hours[i].time).replace(/([ap])$/, '$1m');
    // Keep labels near the edges from running off the chart.
    const anchor = i < 3 ? 'start' : i > n - 4 ? 'end' : 'middle';
    const label = svgElement(
      svg,
      'text',
      {
        x: x(i),
        y: 0,
        'text-anchor': anchor,
        'font-size': 12,
        fill: '#eceae4',
        ...LABEL,
      },
      `${word} ${Math.round(felts[i])}° · ${when}`,
    );

    const box = label.getBBox();
    const ys = [];
    for (let px = box.x - 2; px <= box.x + box.width + 2; px += 2)
      ys.push(lineY(px));
    // How far the baseline sits below the top of the text box.
    const ascent = -box.y;
    const below = Math.max(...ys) + GAP + ascent;
    const above = Math.min(...ys) - GAP - (box.height - ascent);
    // Fall back to the other side when there's no room on the preferred one.
    const fitsBelow = below + box.height - ascent <= plotBottom;
    const fitsAbove = above - ascent >= 0;
    const baseline = under
      ? fitsBelow || !fitsAbove
        ? below
        : above
      : fitsAbove || !fitsBelow
        ? above
        : below;
    label.setAttribute('y', baseline);
  }

  svgElement(
    svg,
    'text',
    {x: x(0), y: 82, 'text-anchor': 'start', 'font-size': 11, fill: '#b9b7af'},
    'now',
  );
  hours.forEach((h, i) => {
    // Skip labels too close to "now" or to the right edge to fit.
    if (i < 2 || i > n - 2 || h.time.getHours() % 3) return;
    svgElement(
      svg,
      'text',
      {
        x: x(i),
        y: 82,
        'text-anchor': 'middle',
        'font-size': 11,
        fill: '#86847e',
      },
      hourLabel(h.time),
    );
  });
}

// Days beyond this are drawn fainter: the forecast is much less sure of them.
const CONFIDENT_DAYS = 5;
// The ten days as one continuous line, every three hours, so it shows when
// within a day things change: a front arriving at noon, rain overnight. The
// columns above keep each day's name, date and icon; its high and low sit in
// rows above and below the line, each marked on it with a dot.
//
// `days` is [{name, date, icon, hi, lo, chance, blocks}], today first. `icon`
// is comfort's SVG markup for the day's weather; `blocks` are three-hour
// averages, [{hour, felt, chance, snow, radiation}].
export function drawDaily(container, days) {
  const cells = (render) =>
    days
      .map(
        (d, k) =>
          `<div class="day${k === 0 ? ' today' : ''}${k >= CONFIDENT_DAYS ? ' far' : ''}">${render(d, k)}</div>`,
      )
      .join('');
  container.innerHTML = `
    <div class="cells day-heads">${cells(
      (d, k) => `
        <div class="name">${k === 0 ? 'Today' : d.name}</div>
        <div class="date">${d.date}</div>
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${d.icon}</svg>
        <div class="chance">${d.chance >= SHOW_CHANCE ? `${Math.round(d.chance / 10) * 10}%` : ''}</div>`,
    )}</div>
    <div class="cells highs">${cells((d) => `${Math.round(d.hi)}°`)}</div>
    <svg class="week" role="img" aria-label="Feels-like temperature for the next ${days.length} days"></svg>
    <div class="cells lows">${cells((d) => `${Math.round(d.lo)}°`)}</div>`;

  const svg = container.querySelector('svg.week');
  const box = svg.getBoundingClientRect();
  const width = 360;
  const height = (width * box.height) / box.width;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const dayWidth = width / days.length;
  const points = days.flatMap((d, k) =>
    d.blocks.map((b) => ({...b, x: (k + b.hour / 24) * dayWidth, day: k})),
  );
  const felts = points.map((p) => p.felt);
  const min = Math.min(...felts);
  const max = Math.max(...felts);
  const pad = 6;
  const y = (t) => pad + (1 - (t - min) / (max - min)) * (height - 2 * pad);

  // A softer sky wash than the 24-hour chart's: the line's own rise and fall
  // already says day and night.
  const defs = svgElement(svg, 'defs', {});
  const wash = svgElement(defs, 'linearGradient', {id: 'week-wash'});
  for (const p of points) {
    svgElement(wash, 'stop', {
      offset: p.x / width,
      'stop-color': skyColor(p.radiation / 2),
    });
  }
  svgElement(svg, 'rect', {x: 0, y: 0, width, height, fill: 'url(#week-wash)'});

  // Midnights, faintly, so each stretch of line sits under its day.
  for (let k = 1; k < days.length; k++) {
    svgElement(svg, 'line', {
      x1: k * dayWidth,
      y1: 0,
      x2: k * dayWidth,
      y2: height,
      stroke: '#1e2024',
      'stroke-width': 1,
    });
  }

  const barWidth = (dayWidth / 8) * 0.6;
  for (const p of points) {
    if (p.chance < SHOW_CHANCE) continue;
    const h = (p.chance / 100) * height * 0.45;
    svgElement(svg, 'rect', {
      x: p.x - barWidth / 2,
      y: height - h,
      width: barWidth,
      height: h,
      rx: 1,
      fill: p.snow ? '#c9d6ea' : '#3f78ba',
      opacity: 0.75,
    });
  }

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    svgElement(svg, 'line', {
      x1: a.x,
      y1: y(a.felt),
      x2: b.x,
      y2: y(b.felt),
      stroke: temperatureColor((a.felt + b.felt) / 2),
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
    });
  }

  // Each day's warmest and coolest point on the line, under its numbers.
  days.forEach((d, k) => {
    const own = points.filter((p) => p.day === k);
    for (const p of [
      own.reduce((a, b) => (b.felt > a.felt ? b : a)),
      own.reduce((a, b) => (b.felt < a.felt ? b : a)),
    ]) {
      svgElement(svg, 'circle', {
        cx: p.x,
        cy: y(p.felt),
        r: 2.5,
        fill: temperatureColor(p.felt),
        stroke: '#0d0e10',
        'stroke-width': 1.5,
      });
    }
  });

  // Later days fade, like the columns above them.
  svgElement(svg, 'rect', {
    x: CONFIDENT_DAYS * dayWidth,
    y: 0,
    width: width - CONFIDENT_DAYS * dayWidth,
    height,
    fill: '#0d0e10',
    opacity: 0.4,
  });
}
