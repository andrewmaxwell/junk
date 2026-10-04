// Draws data/viz.json (written by build.js). The data is private and
// gitignored, so on the public site this just explains how to get it.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

const parseTs = d3.timeParse('%Y-%m-%d %H:%M:%S');
const parseDay = d3.timeParse('%Y-%m-%d');
const HOUR = 36e5;

function draw(raw) {
  const days = raw.days.map((d) => ({
    ...d,
    date: parseDay(d.day),
    bedtime: d.bedtime && parseTs(d.bedtime),
    final_wake: d.final_wake && parseTs(d.final_wake),
    fitbit_long_wake: d.fitbit_long_wake && parseTs(d.fitbit_long_wake),
  }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const ts = (rows, ...keys) =>
    rows.map((r) => {
      const out = {...r};
      for (const k of keys) out[k] = parseTs(r[k]);
      return out;
    });
  const data = {
    days,
    byDay,
    timeline: raw.timeline.map((e) => ({...e, date: parseDay(e.day)})),
    headaches: ts(raw.headaches, 'start'),
    // Naps (entirely 11am-6pm) aren't part of a night, same as schema.sql.
    sessions: ts(raw.sessions, 'start', 'end').filter(
      (s) =>
        !(
          s.start.getHours() >= 11 &&
          s.start.getHours() < 18 &&
          s.end.getHours() >= 11 &&
          s.end.getHours() < 18
        ),
    ),
    cpapEvents: ts(raw.cpapEvents, 'ts'),
    cpapMinutes: ts(raw.cpapMinutes, 'ts'),
    heartRate: ts(raw.heartRate, 'ts'),
    sleepStages: ts(raw.sleepStages, 'start', 'end'),
    air: ts(raw.air, 'ts'),
    weather: ts(raw.weather, 'ts'),
  };
  document.getElementById('content').hidden = false;

  drawTiles(data);
  drawHeadacheTable(data);
  const nights = setupNights(data);
  const renderAll = () => {
    drawCoverage(data);
    drawHeadaches(data);
    drawJournal(data);
    nights.render();
  };
  renderAll();
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    renderAll();
  });
}

// ---------- shared pieces ----------

const tipEl = document.getElementById('tip');

// rows: [value, label, colorVar?]. Built with textContent; notes and titles
// are free text.
function showTip(event, title, rows = [], note) {
  tipEl.replaceChildren();
  const t = document.createElement('div');
  t.className = 'title';
  t.textContent = title;
  tipEl.append(t);
  for (const [value, label, color] of rows) {
    const r = document.createElement('div');
    r.className = 'r';
    if (color) {
      const i = document.createElement('i');
      i.style.setProperty('--c', `var(${color})`);
      r.append(i);
    }
    const b = document.createElement('b');
    b.textContent = value;
    const s = document.createElement('span');
    s.textContent = label;
    r.append(b, s);
    tipEl.append(r);
  }
  if (note) {
    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = note;
    tipEl.append(n);
  }
  tipEl.style.display = 'block';
  const {width, height} = tipEl.getBoundingClientRect();
  let x = event.clientX + 14;
  let y = event.clientY + 14;
  if (x + width > innerWidth - 8) x = event.clientX - width - 14;
  if (y + height > innerHeight - 8) y = event.clientY - height - 14;
  tipEl.style.left = `${Math.max(8, x)}px`;
  tipEl.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => (tipEl.style.display = 'none');

function frame(id, height, margin) {
  const el = document.getElementById(id);
  el.replaceChildren();
  const width = el.clientWidth;
  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  return {
    svg,
    g,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };
}

const fmtDay = d3.timeFormat('%a %b %-d, %Y');
const fmtMonth = d3.timeFormat('%B %Y');
const fmtTime = d3.timeFormat('%-I:%M %p');
const round = (x, n = 0) => (x == null ? '–' : (+x).toFixed(n));
const nightOf = (t) => d3.timeDay.floor(new Date(+t + 12 * HOUR));
const dayKey = d3.timeFormat('%Y-%m-%d');

// Columns: a rounded data end, square at the baseline.
function columnPath(x, y0, y1, w, r = 4) {
  const h = y0 - y1;
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
}

// Life events as hoverable dots on a row above a time axis.
function drawEvents(g, x, events, y) {
  const shown = events.filter(
    (e) => !['data', 'aranet_away'].includes(e.kind) && x(e.date) >= 0,
  );
  const line = g
    .append('line')
    .attr('class', 'crosshair')
    .attr('y1', y)
    .attr('y2', y + 1e4)
    .style('display', 'none');
  g.append('g')
    .selectAll('circle')
    .data(shown)
    .join('circle')
    .attr('cx', (e) => x(e.date))
    .attr('cy', y)
    .attr('r', 4)
    .attr('fill', 'var(--ink-2)')
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 2);
  // Big invisible hit targets.
  g.append('g')
    .selectAll('circle')
    .data(shown)
    .join('circle')
    .attr('cx', (e) => x(e.date))
    .attr('cy', y)
    .attr('r', 10)
    .attr('fill', 'transparent')
    .style('cursor', 'default')
    .on('pointermove', (event, e) => {
      line.style('display', null).attr('x1', x(e.date)).attr('x2', x(e.date));
      const same = shown.filter((o) => o.day === e.day);
      showTip(
        event,
        fmtDay(e.date),
        [],
        same.map((o) => `${o.kind}: ${o.event}`).join('\n'),
      );
    })
    .on('pointerleave', () => {
      line.style('display', 'none');
      hideTip();
    });
  return line;
}

// ---------- tiles ----------

function drawTiles({days, sessions}) {
  const today = days.at(-1).date;
  const within = (n, offset = 0) =>
    days.filter(
      (d) =>
        d.date > d3.timeDay.offset(today, -n - offset) &&
        d.date <= d3.timeDay.offset(today, -offset),
    );
  const headacheRate = (rows) =>
    (d3.sum(rows, (d) => d.headache_events > 0) / rows.length) * 30;
  const recent = within(90);
  const yearAgo = within(90, 365);
  const nights = within(30).filter((d) => d.final_wake);
  const fitbitNights = within(30).filter((d) => d.fitbit_insomnia != null);
  const tiles = [
    {
      label: 'Journal entries',
      value: d3.format(',')(days.filter((d) => d.energy != null).length),
      note: `since ${d3.timeFormat('%b %Y')(days.find((d) => d.energy != null).date)}`,
    },
    {
      label: 'Headache days per 30, last 90 days',
      value: round(headacheRate(recent), 1),
      note: `${round(headacheRate(yearAgo), 1)} the same 90 days a year earlier`,
    },
    {
      label: 'Insomnia nights, last 30',
      value: `${nights.filter((d) => d.insomnia).length} of ${nights.length}`,
      note: `30+ min awake starting 3–6am, from the CPAP. Fitbit: ${fitbitNights.filter((d) => d.fitbit_insomnia).length} of ${fitbitNights.length}`,
    },
    {
      label: 'Mask-on time, last 30 nights',
      value: `${round(d3.mean(nights, (d) => d.cpap_usage_min) / 60, 1)} h`,
      note: `${d3.format(',')(sessions.length)} CPAP sessions in all`,
    },
  ];
  const el = document.getElementById('tiles');
  el.replaceChildren(
    ...tiles.map(({label, value, note}) => {
      const div = document.createElement('div');
      div.className = 'tile';
      for (const [cls, text] of [
        ['label', label],
        ['value', value],
        ['note', note],
      ]) {
        const p = document.createElement('div');
        p.className = cls;
        p.textContent = text;
        div.append(p);
      }
      return div;
    }),
  );
}

// ---------- coverage ----------

const lanes = [
  ['Journal', (d) => d.energy != null],
  ['Headache log', (d) => d.date >= parseDay('2021-08-27')],
  ['CPAP', (d) => d.cpap_usage_min > 0],
  ['Bedroom air', (d) => d.bedroom_co2_avg != null],
  ['Fitbit sleep', (d) => d.minutes_asleep != null || d.resting_hr != null],
  ['Steps', (d) => d.steps > 0],
  ['Location', (d) => d.hours_out != null],
  ['Slept away', (d) => d.slept_km_from_home >= 50],
  ['Weather', (d) => d.outdoor_temp_max != null],
];

function drawCoverage({days, timeline}) {
  const laneH = 18;
  const margin = {top: 22, right: 8, bottom: 24, left: 96};
  const {g, w, h} = frame(
    'coverage',
    margin.top + lanes.length * laneH + margin.bottom,
    margin,
  );
  const x = d3
    .scaleTime()
    .domain([days[0].date, d3.timeDay.offset(days.at(-1).date, 1)])
    .range([0, w]);
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(w / 80));
  lanes.forEach(([name, has], i) => {
    const y = i * laneH;
    g.append('text')
      .attr('class', 'lane-label')
      .attr('x', -8)
      .attr('y', y + laneH / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .text(name);
    g.append('rect')
      .attr('y', y + 3)
      .attr('width', w)
      .attr('height', laneH - 6)
      .attr('fill', 'var(--hover)')
      .attr('rx', 2);
    // Merge consecutive days into runs.
    const runs = [];
    for (const d of days) {
      if (!has(d)) continue;
      const last = runs.at(-1);
      if (last && +last.end === +d.date) {
        last.end = d3.timeDay.offset(d.date, 1);
      } else runs.push({start: d.date, end: d3.timeDay.offset(d.date, 1)});
    }
    g.append('g')
      .selectAll('rect')
      .data(runs)
      .join('rect')
      .attr('x', (r) => x(r.start))
      .attr('width', (r) => Math.max(1, x(r.end) - x(r.start)))
      .attr('y', y + 3)
      .attr('height', laneH - 6)
      .attr('fill', 'var(--series-1)');
  });
  // Hover anywhere on the lanes for that day's sources.
  const line = g
    .append('line')
    .attr('class', 'crosshair')
    .attr('y1', 0)
    .attr('y2', h)
    .style('display', 'none');
  g.append('rect')
    .attr('width', w)
    .attr('height', h)
    .attr('fill', 'transparent')
    .on('pointermove', (event) => {
      const date = d3.timeDay.floor(x.invert(d3.pointer(event)[0]));
      const d = days.find((r) => +r.date === +date);
      if (!d) return;
      line.style('display', null).attr('x1', x(date)).attr('x2', x(date));
      showTip(
        event,
        fmtDay(date),
        lanes.map(([name, has]) => [has(d) ? '✓' : '·', name]),
      );
    })
    .on('pointerleave', () => {
      line.style('display', 'none');
      hideTip();
    });
  drawEvents(g, x, timeline, -12);
}

// ---------- headaches by month ----------

function headacheMonths({days}) {
  const start = parseDay('2021-08-01');
  return d3
    .rollups(
      days.filter((d) => d.date >= start),
      (rows) => ({
        morning: rows.filter(
          (d) => d.headache_events > 0 && d.headache_first_time < '09:00',
        ).length,
        later: rows.filter(
          (d) => d.headache_events > 0 && !(d.headache_first_time < '09:00'),
        ).length,
        triptan: rows.filter((d) => d.triptan).length,
        days: rows.length,
      }),
      (d) => +d3.timeMonth.floor(d.date),
    )
    .map(([m, v]) => ({month: new Date(m), ...v}));
}

function drawHeadaches(data) {
  const months = headacheMonths(data);
  const margin = {top: 22, right: 8, bottom: 24, left: 32};
  const {g, w, h} = frame('headaches', 260, margin);
  const x = d3
    .scaleTime()
    .domain([months[0].month, d3.timeMonth.offset(months.at(-1).month, 1)])
    .range([0, w]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(months, (m) => m.morning + m.later)])
    .nice()
    .range([h, 0]);
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(y)
        .ticks(5)
        .tickSize(-w)
        .tickFormat((v) => v),
    )
    .call((s) => s.selectAll('text').attr('x', -6));
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(w / 80));
  const slot = w / months.length;
  const bw = Math.min(24, Math.max(1, slot - 2));
  const gap = slot > 6 ? 2 : 0;
  const col = g
    .append('g')
    .selectAll('g')
    .data(months)
    .join('g')
    .attr('transform', (m) => `translate(${x(m.month) + (slot - bw) / 2},0)`);
  col
    .append('path')
    .attr('fill', 'var(--series-1)')
    .attr('d', (m) =>
      m.later
        ? m.morning
          ? `M0,${h}V${y(m.morning)}H${bw}V${h}Z`
          : ''
        : columnPath(0, h, y(m.morning), bw),
    );
  col
    .append('path')
    .attr('fill', 'var(--series-2)')
    .attr('d', (m) =>
      columnPath(
        0,
        y(m.morning) - (m.morning ? gap : 0),
        y(m.morning + m.later),
        bw,
      ),
    );
  col
    .append('rect')
    .attr('x', -(slot - bw) / 2)
    .attr('width', slot)
    .attr('height', h)
    .attr('fill', 'transparent')
    .on('pointermove', function (event, m) {
      d3.select(this).attr('fill', 'var(--hover)');
      showTip(event, fmtMonth(m.month), [
        [m.morning, 'started before 9am', '--series-1'],
        [m.later, 'started 9am or later', '--series-2'],
        [m.triptan, 'with a triptan noted'],
      ]);
    })
    .on('pointerleave', function () {
      d3.select(this).attr('fill', 'transparent');
      hideTip();
    });
  drawEvents(g, x, data.timeline, -12);
}

function drawHeadacheTable(data) {
  const table = document.createElement('table');
  const head = table.insertRow();
  for (const t of ['Month', 'Before 9am', '9am or later', 'Triptan']) {
    const th = document.createElement('th');
    th.textContent = t;
    head.append(th);
  }
  for (const m of headacheMonths(data).reverse()) {
    const r = table.insertRow();
    for (const v of [fmtMonth(m.month), m.morning, m.later, m.triptan]) {
      r.insertCell().textContent = v;
    }
  }
  document.getElementById('headache-table').replaceChildren(table);
}

// ---------- journal small multiples ----------

function drawJournal({days}) {
  const el = document.getElementById('journal');
  el.replaceChildren();
  const rated = days.filter((d) => d.energy != null);
  const fields = [
    ['energy', 'Energy'],
    ['mood', 'Mood'],
    ['anxiety', 'Anxiety'],
    ['headache', 'Headache'],
  ];
  // Lay out every box first so each chart measures its final width.
  for (const [key, label] of fields) {
    const box = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = label;
    const chart = document.createElement('div');
    chart.className = 'chart';
    chart.id = `journal-${key}`;
    box.append(h3, chart);
    el.append(box);
  }
  for (const [key, label] of fields) {
    const months = d3
      .rollups(
        rated.filter((d) => d[key] != null),
        (rows) => d3.mean(rows, (d) => d[key]),
        (d) => +d3.timeMonth.floor(d.date),
      )
      .map(([m, v]) => ({month: new Date(m), v}))
      .sort((a, b) => a.month - b.month);
    const margin = {top: 8, right: 8, bottom: 22, left: 22};
    const {g, w, h} = frame(`journal-${key}`, 120, margin);
    const x = d3
      .scaleTime()
      .domain(d3.extent(months, (m) => m.month))
      .range([0, w]);
    const y = d3.scaleLinear().domain([0, 5]).range([h, 0]);
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(3).tickSize(-w))
      .call((s) => s.selectAll('text').attr('x', -4));
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, w / 70)));
    g.append('path')
      .datum(months)
      .attr('fill', 'var(--wash)')
      .attr(
        'd',
        d3
          .area()
          .x((m) => x(m.month))
          .y0(h)
          .y1((m) => y(m.v)),
      );
    g.append('path')
      .datum(months)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-1)')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr(
        'd',
        d3
          .line()
          .x((m) => x(m.month))
          .y((m) => y(m.v)),
      );
    const line = g
      .append('line')
      .attr('class', 'crosshair')
      .attr('y1', 0)
      .attr('y2', h)
      .style('display', 'none');
    const dot = g
      .append('circle')
      .attr('r', 4)
      .attr('fill', 'var(--series-1)')
      .attr('stroke', 'var(--surface)')
      .attr('stroke-width', 2)
      .style('display', 'none');
    g.append('rect')
      .attr('width', w)
      .attr('height', h)
      .attr('fill', 'transparent')
      .on('pointermove', (event) => {
        const t = x.invert(d3.pointer(event)[0]);
        const m =
          months[
            d3.bisectCenter(
              months.map((m) => +m.month),
              +t,
            )
          ];
        line
          .style('display', null)
          .attr('x1', x(m.month))
          .attr('x2', x(m.month));
        dot.style('display', null).attr('cx', x(m.month)).attr('cy', y(m.v));
        showTip(event, fmtMonth(m.month), [
          [round(m.v, 2), `average ${label.toLowerCase()}`],
        ]);
      })
      .on('pointerleave', () => {
        line.style('display', 'none');
        dot.style('display', 'none');
        hideTip();
      });
  }
}

// ---------- nights ----------

// Hours since 7pm the evening before `night`.
const nightStart = (night) => d3.timeHour.offset(night, -5);
const WINDOW_H = 17; // 7pm to noon

function setupNights(data) {
  const sessionsByNight = d3.group(data.sessions, (s) => +nightOf(s.end));
  // Fitbit wakes of 5+ minutes, skipping the few minutes awake at bedtime.
  const awakeByNight = d3.group(
    data.sleepStages.filter((st) => {
      const bed = data.byDay.get(dayKey(nightOf(st.end)))?.bedtime;
      return (
        st.stage === 'AWAKE' &&
        st.end - st.start >= 5 * 6e4 &&
        !(bed && st.start - bed < 15 * 6e4)
      );
    }),
    (st) => +nightOf(st.end),
  );
  data.awakeByNight = awakeByNight;
  const headachesByDay = d3.group(data.headaches, (hd) => dayKey(hd.start));
  const nights = [...sessionsByNight.keys()]
    .sort((a, b) => a - b)
    .map((n) => new Date(n));
  let count = 90;
  let selected = nights.at(-1);

  const buttons = [...document.querySelectorAll('#night-range button')];
  for (const b of buttons) {
    b.addEventListener('click', () => {
      count = +b.dataset.n;
      render();
    });
  }

  const dateInput = document.getElementById('night-date');
  dateInput.min = dayKey(nights[0]);
  dateInput.max = dayKey(nights.at(-1));
  dateInput.addEventListener('change', () => {
    const d = parseDay(dateInput.value);
    if (d) select(d);
  });
  const step = (dir) => {
    const i = d3.bisectLeft(nights.map(Number), +selected);
    const next = nights[Math.max(0, Math.min(nights.length - 1, i + dir))];
    if (next) select(next);
  };
  document.getElementById('prev-night').onclick = () => step(-1);
  document.getElementById('next-night').onclick = () => step(1);

  function select(night, scroll) {
    selected = night;
    render();
    if (scroll) {
      document
        .getElementById('night-section')
        .scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  function render() {
    for (const b of buttons) {
      b.setAttribute('aria-pressed', String(+b.dataset.n === count));
    }
    drawNights(
      data,
      count ? nights.slice(-count) : nights,
      sessionsByNight,
      headachesByDay,
      selected,
      (n) => select(n, true),
    );
    drawNight(data, selected, sessionsByNight, headachesByDay);
  }
  return {render};
}

function drawNights(
  data,
  nights,
  sessionsByNight,
  headachesByDay,
  selected,
  onPick,
) {
  const margin = {top: 8, right: 8, bottom: 24, left: 52};
  const {g, w, h} = frame('nights', 300, margin);
  const x = d3
    .scaleBand()
    .domain(nights.map(Number))
    .range([0, w])
    .paddingInner(0);
  const y = d3.scaleLinear().domain([0, WINDOW_H]).range([0, h]);
  const hourLabel = (v) =>
    fmtTime(new Date(2000, 0, 1, 19 + v)).replace(':00', '');
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(y)
        .tickValues([1, 4, 8, 12, 16])
        .tickSize(-w)
        .tickFormat(hourLabel),
    )
    .call((s) => s.selectAll('text').attr('x', -6));
  // The goal: asleep 11pm to 7am.
  g.append('rect')
    .attr('y', y(4))
    .attr('height', y(12) - y(4))
    .attr('width', w)
    .attr('fill', 'var(--hover)');
  const fmtTick = d3.timeFormat(nights.length > 120 ? '%b %Y' : '%b %-d');
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(
          x
            .domain()
            .filter((_, i, all) => i % Math.ceil(all.length / (w / 70)) === 0),
        )
        .tickFormat((n) => fmtTick(new Date(n))),
    );
  const slot = x.bandwidth();
  const bw = Math.min(24, Math.max(1, slot - (slot > 4 ? 2 : 0)));
  const off = (slot - bw) / 2;
  const cols = g
    .append('g')
    .selectAll('g')
    .data(nights)
    .join('g')
    .attr('transform', (n) => `translate(${x(+n)},0)`);
  const clamp = (v) => Math.max(0, Math.min(WINDOW_H, v));
  cols
    .selectAll('rect.s')
    .data((n) =>
      sessionsByNight.get(+n).map((s) => ({
        y0: clamp((s.start - nightStart(n)) / HOUR),
        y1: clamp((s.end - nightStart(n)) / HOUR),
      })),
    )
    .join('rect')
    .attr('class', 's')
    .attr('x', off)
    .attr('width', bw)
    .attr('y', (s) => y(s.y0))
    .attr('height', (s) => Math.max(1, y(s.y1) - y(s.y0)))
    .attr('rx', bw >= 8 ? 2 : 0)
    .attr('fill', 'var(--series-1)');
  cols
    .selectAll('rect.a')
    .data((n) =>
      (data.awakeByNight.get(+n) ?? []).map((st) => ({
        y0: clamp((st.start - nightStart(n)) / HOUR),
        y1: clamp((st.end - nightStart(n)) / HOUR),
      })),
    )
    .join('rect')
    .attr('class', 'a')
    .attr('x', off)
    .attr('width', bw)
    .attr('y', (s) => y(s.y0))
    .attr('height', (s) => Math.max(1, y(s.y1) - y(s.y0)))
    .attr('fill', 'var(--awake)');
  cols
    .selectAll('circle')
    .data((n) =>
      (headachesByDay.get(dayKey(n)) ?? [])
        .map((hd) => (hd.start - nightStart(n)) / HOUR)
        .filter((v) => v >= 0 && v <= WINDOW_H),
    )
    .join('circle')
    .attr('cx', slot / 2)
    .attr('cy', (v) => y(v))
    .attr('r', Math.max(3, Math.min(5, slot / 2)))
    .attr('fill', 'var(--series-2)')
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 2);
  // Selection outline and hover targets.
  cols
    .filter((n) => +n === +selected)
    .insert('rect', ':first-child')
    .attr('width', slot)
    .attr('height', h)
    .attr('fill', 'var(--wash)');
  cols
    .append('rect')
    .attr('width', slot)
    .attr('height', h)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('pointermove', function (event, n) {
      d3.select(this).attr('fill', 'var(--hover)');
      const d = data.byDay.get(dayKey(n)) ?? {};
      const hds = headachesByDay.get(dayKey(n)) ?? [];
      showTip(event, `Night ending ${fmtDay(n)}`, [
        [d.bedtime ? fmtTime(d.bedtime) : '–', 'mask on'],
        [d.final_wake ? fmtTime(d.final_wake) : '–', 'up for the day'],
        [`${d.awake_mid_night_min ?? 0} min`, 'awake mid-night'],
        [d.insomnia ? 'yes' : 'no', 'insomnia (3–6am), CPAP'],
        ...(d.fitbit_insomnia == null
          ? []
          : [
              [d.fitbit_insomnia ? 'yes' : 'no', 'insomnia, Fitbit'],
              [`${d.fitbit_awake_in_bed_min} min`, 'awake in bed, Fitbit'],
            ]),
        ...(d.fitbit_long_wake
          ? [
              [
                fmtTime(d.fitbit_long_wake),
                `long wake (${d.fitbit_long_wake_min} min, from ${d.fitbit_long_wake_from.toLowerCase()})`,
              ],
            ]
          : []),
        [round(d.ahi, 1), 'AHI'],
        ...hds.map((hd) => [fmtTime(hd.start), hd.title, '--series-2']),
      ]);
    })
    .on('pointerleave', function () {
      d3.select(this).attr('fill', 'transparent');
      hideTip();
    })
    .on('click', (_, n) => {
      hideTip();
      onPick(n);
    });
}

// ---------- one night in detail ----------

const stageOrder = ['AWAKE', 'REM', 'LIGHT', 'DEEP'];
const eventRows = [
  [
    'Obstructive',
    (t) => ['Obstructive Apnea', 'Apnea', 'Hypopnea'].includes(t),
  ],
  ['Central', (t) => t === 'Central Apnea'],
  ['Arousal', (t) => t === 'Arousal'],
];

function drawNight(data, night, sessionsByNight, headachesByDay) {
  const from = nightStart(night);
  const to = d3.timeHour.offset(from, WINDOW_H);
  const inWindow = (t) => t >= from && t <= to;
  const d = data.byDay.get(dayKey(night)) ?? {};
  const eve = data.byDay.get(dayKey(d3.timeDay.offset(night, -1))) ?? {};

  document.getElementById('night-title').textContent =
    `Night ending ${fmtDay(night)}`;
  document.getElementById('night-date').value = dayKey(night);

  // Summary: the night itself, and the journal for the day before it.
  const head = document.getElementById('night-head');
  head.replaceChildren();
  const facts = document.createElement('div');
  facts.className = 'facts';
  const fact = (label, value) => {
    const s = document.createElement('span');
    s.textContent = `${label} `;
    const b = document.createElement('b');
    b.textContent = value;
    s.append(b);
    facts.append(s);
  };
  fact('Mask on', d.bedtime ? fmtTime(d.bedtime) : '–');
  fact('Up', d.final_wake ? fmtTime(d.final_wake) : '–');
  fact('Awake mid-night', `${d.awake_mid_night_min ?? 0} min`);
  fact('AHI', round(d.ahi, 1));
  if (d.minutes_asleep) {
    fact('Fitbit asleep', `${round(d.minutes_asleep / 60, 1)} h`);
    fact('Fell asleep in', `${d.fitbit_sleep_onset_min ?? '–'} min`);
    fact('Awake in bed', `${d.fitbit_awake_in_bed_min} min`);
    if (d.fitbit_long_wake) {
      fact(
        'Long wake',
        `${fmtTime(d.fitbit_long_wake)}, ${d.fitbit_long_wake_min} min, from ${d.fitbit_long_wake_from.toLowerCase()}`,
      );
    }
  }
  if (d.bedroom_co2_avg) fact('Bedroom CO₂', `${round(d.bedroom_co2_avg)} ppm`);
  fact(
    'Outdoor',
    `${round(d.outdoor_temp_min)}–${round(d.outdoor_temp_max)}°C`,
  );
  if (d.slept_km_from_home >= 1)
    fact('Slept', `${round(d.slept_km_from_home)} km from home`);
  head.append(facts);
  for (const [label, row] of [
    ['Evening before', eve],
    ['That day', d],
  ]) {
    if (row.energy == null && !row.notes) continue;
    const p = document.createElement('div');
    p.className = 'notes';
    p.textContent = `${label}: energy ${row.energy ?? '–'}, mood ${row.mood ?? '–'}, anxiety ${row.anxiety ?? '–'}, headache ${row.headache ?? '–'}. ${row.notes ?? ''}`;
    head.append(p);
    if (row.tags?.length) {
      const t = document.createElement('div');
      t.className = 'tags';
      t.textContent = row.tags.join(' · ');
      head.append(t);
    }
  }

  const sessions = sessionsByNight.get(+night) ?? [];
  const events = data.cpapEvents.filter((e) => inWindow(e.ts));
  const stages = data.sleepStages.filter((s) => s.end >= from && s.start <= to);
  const hr = data.heartRate.filter((r) => inWindow(r.ts));
  const leak = data.cpapMinutes.filter((r) => inWindow(r.ts));
  const air = data.air.filter((r) => inWindow(r.ts));
  const weather = data.weather.filter((r) => inWindow(r.ts));
  const headaches = [
    ...(headachesByDay.get(dayKey(d3.timeDay.offset(night, -1))) ?? []),
    ...(headachesByDay.get(dayKey(night)) ?? []),
  ].filter((hd) => inWindow(hd.start));

  const lineSeries = (rows, key, unit, digits = 0) => ({
    rows,
    key,
    unit,
    digits,
  });
  const panels = [
    {label: 'CPAP', height: 74, kind: 'cpap', empty: !sessions.length},
    {label: 'Sleep stage', height: 64, kind: 'stages', empty: !stages.length},
    {
      label: 'Heart rate',
      height: 70,
      kind: 'line',
      s: lineSeries(hr, 'bpm', 'bpm'),
    },
    {
      label: 'Mask leak',
      height: 60,
      kind: 'line',
      s: lineSeries(leak, 'leak', 'L/s', 2),
    },
    {
      label: 'Breathing rate',
      height: 60,
      kind: 'line',
      s: lineSeries(leak, 'resp_rate', '/min', 1),
    },
    {
      label: 'Bedroom CO₂',
      height: 70,
      kind: 'line',
      s: lineSeries(air, 'co2', 'ppm'),
    },
    {
      label: 'Outdoor temp',
      height: 60,
      kind: 'line',
      s: lineSeries(weather, 'temp_c', '°C', 1),
    },
  ];
  for (const p of panels) if (p.s) p.empty = !p.s.rows.length;

  const gapH = 14;
  const emptyH = 22;
  const margin = {top: 4, right: 8, bottom: 24, left: 104};
  const total = d3.sum(panels, (p) => (p.empty ? emptyH : p.height) + gapH);
  const {g, w, h} = frame('night', total + margin.top + margin.bottom, margin);
  const x = d3.scaleTime().domain([from, to]).range([0, w]);
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(d3.timeHour.every(w > 600 ? 1 : 2))
        .tickFormat(d3.timeFormat('%-I%p')),
    );

  const readers = []; // (t) => [value, label] for the crosshair
  let top = 0;
  for (const p of panels) {
    const ph = p.empty ? emptyH : p.height;
    const pg = g.append('g').attr('transform', `translate(0,${top})`);
    top += ph + gapH;
    pg.append('text')
      .attr('class', 'panel-label')
      .attr('x', -10)
      .attr('y', p.empty ? ph / 2 : 10)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .text(p.label);
    if (p.empty) {
      pg.append('text')
        .attr('y', ph / 2)
        .attr('dy', '0.35em')
        .text('No data this night');
      continue;
    }
    pg.append('line')
      .attr('x2', w)
      .attr('y1', ph)
      .attr('y2', ph)
      .attr('stroke', 'var(--axis)');

    if (p.kind === 'cpap') {
      const rowH = (ph - 22) / eventRows.length;
      pg.append('g')
        .selectAll('rect')
        .data(sessions)
        .join('rect')
        .attr('x', (s) => x(Math.max(s.start, from)))
        .attr('width', (s) =>
          Math.max(1, x(Math.min(s.end, to)) - x(Math.max(s.start, from))),
        )
        .attr('y', 0)
        .attr('height', 14)
        .attr('rx', 3)
        .attr('fill', 'var(--series-1)');
      eventRows.forEach(([name, match], i) => {
        const ry = 22 + i * rowH;
        pg.append('text')
          .attr('x', -10)
          .attr('y', ry + rowH / 2)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'end')
          .text(name);
        pg.append('g')
          .selectAll('line')
          .data(events.filter((e) => match(e.type)))
          .join('line')
          .attr('x1', (e) => x(e.ts))
          .attr('x2', (e) => x(e.ts))
          .attr('y1', ry + 2)
          .attr('y2', ry + rowH - 2)
          .attr('stroke', 'var(--ink-2)')
          .attr('stroke-width', 1.5);
      });
      pg.select('text.panel-label').attr('y', 7);
      readers.push((t) => {
        const on = sessions.some((s) => t >= s.start && t <= s.end);
        const near = events.filter((e) => Math.abs(e.ts - t) < 5 * 6e4);
        return [
          [on ? 'on' : 'off', 'mask'],
          ...(near.length
            ? [
                [
                  near.length,
                  `CPAP event${near.length > 1 ? 's' : ''} within 5 min`,
                ],
              ]
            : []),
        ];
      });
    } else if (p.kind === 'stages') {
      const y = d3
        .scalePoint()
        .domain(stageOrder)
        .range([4, ph - 4]);
      const pts = stages.flatMap((s) => [
        [Math.max(s.start, from), s.stage],
        [Math.min(s.end, to), s.stage],
      ]);
      pg.append('path')
        .attr('fill', 'none')
        .attr('stroke', 'var(--series-1)')
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
        .attr(
          'd',
          d3
            .line()
            .x((q) => x(q[0]))
            .y((q) => y(q[1]))(pts),
        );
      pg.append('g')
        .call(
          d3
            .axisLeft(y)
            .tickSize(0)
            .tickFormat((s) => s[0] + s.slice(1).toLowerCase()),
        )
        .call((s) => s.select('.domain').remove())
        .call((s) => s.selectAll('text').attr('x', -4));
      pg.select('text.panel-label').attr('y', -2).attr('x', -52);
      readers.push((t) => {
        const s = stages.find((q) => t >= q.start && t < q.end);
        return s ? [[s.stage.toLowerCase(), 'sleep stage']] : [];
      });
    } else {
      const {rows, key, unit, digits} = p.s;
      const valid = rows.filter((r) => r[key] != null);
      const y = d3
        .scaleLinear()
        .domain(d3.extent(valid, (r) => r[key]))
        .nice(3)
        .range([ph, 4]);
      pg.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(2).tickSize(-w))
        .call((s) => s.selectAll('text').attr('x', -4));
      pg.select('text.panel-label').attr('x', -40);
      // Break the line across gaps (3x the usual spacing, at least 15 min).
      const spacing = d3.median(valid.slice(1), (r, i) => r.ts - valid[i].ts);
      const maxGap = Math.max(15 * 6e4, 3 * (spacing ?? 0));
      const line = d3
        .line()
        .defined((r, i) => i === 0 || r.ts - valid[i - 1].ts <= maxGap)
        .x((r) => x(r.ts))
        .y((r) => y(r[key]));
      pg.append('path')
        .attr('fill', 'none')
        .attr('stroke', 'var(--series-1)')
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
        .attr('d', line(valid));
      const times = valid.map((r) => +r.ts);
      readers.push((t) => {
        const i = d3.bisectCenter(times, +t);
        const r = valid[i];
        return r && Math.abs(r.ts - t) <= maxGap
          ? [[`${round(r[key], digits)} ${unit}`, p.label.toLowerCase()]]
          : [];
      });
    }
  }

  // Headache onsets across all panels.
  for (const hd of headaches) {
    g.append('line')
      .attr('x1', x(hd.start))
      .attr('x2', x(hd.start))
      .attr('y1', 0)
      .attr('y2', h)
      .attr('stroke', 'var(--series-2)')
      .attr('stroke-width', 2);
    g.append('circle')
      .attr('cx', x(hd.start))
      .attr('cy', 0)
      .attr('r', 4)
      .attr('fill', 'var(--series-2)')
      .attr('stroke', 'var(--surface)')
      .attr('stroke-width', 2);
  }

  const cross = g
    .append('line')
    .attr('class', 'crosshair')
    .attr('y1', 0)
    .attr('y2', h)
    .style('display', 'none');
  g.append('rect')
    .attr('width', w)
    .attr('height', h)
    .attr('fill', 'transparent')
    .on('pointermove', (event) => {
      const t = x.invert(d3.pointer(event)[0]);
      cross.style('display', null).attr('x1', x(t)).attr('x2', x(t));
      const near = headaches.filter((hd) => Math.abs(hd.start - t) < 15 * 6e4);
      showTip(event, fmtTime(t), [
        ...readers.flatMap((read) => read(t)),
        ...near.map((hd) => [fmtTime(hd.start), hd.title, '--series-2']),
      ]);
    })
    .on('pointerleave', () => {
      cross.style('display', 'none');
      hideTip();
    });
}

// Last, so every helper above is defined before drawing starts.
const res = await fetch('data/viz.json').catch(() => null);
if (res?.ok) {
  draw(await res.json());
} else {
  document.getElementById('missing').style.display = 'block';
}
