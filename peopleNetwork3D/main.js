import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {correlationCoefficient} from '../peopleStats/correlationCoefficient.js';
import {getData} from '../peopleStats/getData.js';
import {embed} from './embed.js';
import {Renderer} from './Renderer.js';

const numNear = 5; // Lines drawn for the selected person.
const numSkeleton = 2; // Lines drawn from everyone when nobody is selected.

const metrics = {
  raw: {
    name: 'Raw answers',
    distance: (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
      return Math.sqrt(sum);
    },
    // Root mean square difference per answer, in points out of 10.
    format: (d, n) => (d / Math.sqrt(n)).toFixed(1),
    unit: 'typical difference per answer, in points',
    description:
      'Distance is how far apart two sets of answers are. Much of it is how highly people rated themselves overall, which is why color by average answer runs across the cloud.',
  },
  profile: {
    name: 'Profile (correlation)',
    distance: (a, b) => 1 - correlationCoefficient(a, b),
    format: (d) => (1 - d).toFixed(2),
    unit: 'correlation of answers, from -1 to 1',
    description:
      "Distance is 1 minus the correlation of two people's answers, which ignores how highly they rated themselves overall. It's noisy: split the survey in half and the halves barely agree on who is similar.",
  },
};

// Bright enough at both ends to read on black.
const ramp = [
  [70, 130, 255],
  [180, 100, 240],
  [255, 100, 120],
  [255, 210, 80],
];
const rampColor = (t) => {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const k = Math.min(ramp.length - 2, Math.floor(x));
  const c = ramp[k].map((v, i) =>
    Math.round(v + (ramp[k + 1][i] - v) * (x - k)),
  );
  return `rgb(${c})`;
};
const rampCss = `linear-gradient(to right, ${ramp.map((c) => `rgb(${c})`).join(',')})`;

const escapeHtml = (str) =>
  str.replace(
    /[&<>"']/g,
    (c) =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        c
      ],
  );

const mean = (arr) => arr.reduce((sum, x) => sum + x, 0) / arr.length;

const loadMe = () => {
  try {
    return localStorage.getItem('peopleStatsMe') || '';
  } catch {
    return '';
  }
};

const status = document.querySelector('#status');
const panel = document.querySelector('#panel');
const legend = document.querySelector('.legend');
const header = document.querySelector('#header');
const canvas = document.querySelector('canvas');

const main = async () => {
  const url = new URLSearchParams(location.search);
  const data = await getData([], metrics.raw.distance);
  if (data.length < 4) throw new Error('Not enough survey answers to draw.');

  const names = data.map((d) => d.name);
  const vectors = data.map((d) => Object.values(d.answers));
  const traits = Object.keys(data[0].answers);
  const me = loadMe();

  const params = {
    metric: metrics[url.get('metric')] ? url.get('metric') : 'raw',
    color: [...traits, 'Average answer'].includes(url.get('color'))
      ? url.get('color')
      : 'Average answer',
    who: names.includes(url.get('who')) ? url.get('who') : '',
    spin: true,
  };

  const saveUrl = () => {
    const p = new URLSearchParams();
    if (params.metric !== 'raw') p.set('metric', params.metric);
    if (params.color !== 'Average answer') p.set('color', params.color);
    if (params.who) p.set('who', params.who);
    history.replaceState(null, '', location.pathname + (p.size ? `?${p}` : ''));
  };

  // Layouts are cheap (about 100ms for 70 people), but there's no reason to
  // redo one when switching back.
  const layouts = {};
  const getLayout = (key) => {
    if (!layouts[key]) {
      const dist = vectors.map((a) =>
        vectors.map((b) => metrics[key].distance(a, b)),
      );
      const layout = embed(dist);
      // Everyone else, most similar first.
      layout.ranked = dist.map((row, i) =>
        row
          .map((d, j) => [d, j])
          .filter(([, j]) => j !== i)
          .sort((a, b) => a[0] - b[0])
          .map(([, j]) => j),
      );
      layouts[key] = {dist, ...layout};
    }
    return layouts[key];
  };

  // Current positions ease toward the layout's. They start bunched up in the
  // middle so the cloud blooms open.
  let layout = getLayout(params.metric);
  const current = layout.pos.map((p) => p.map((x) => x * 0.02));

  const setMetric = (key) => {
    const next = getLayout(key);
    // Flip axes that would otherwise make everyone swing through the middle.
    for (let k = 0; k < 3; k++) {
      const dot = next.pos.reduce((s, p, i) => s + p[k] * current[i][k], 0);
      if (dot < 0) for (const p of next.pos) p[k] *= -1;
    }
    layout = next;
  };

  const colorValues = () => {
    const vals =
      params.color === 'Average answer'
        ? vectors.map(mean)
        : data.map((d) => d.answers[params.color]);
    const [lo, hi] =
      params.color === 'Average answer'
        ? [Math.min(...vals), Math.max(...vals)]
        : [1, 10];
    return {vals, lo, hi};
  };
  let colors;
  const updateColors = () => {
    const {vals, lo, hi} = colorValues();
    colors = vals.map((v) => rampColor((v - lo) / (hi - lo || 1)));
    const fmt = (x) => (Number.isInteger(x) ? x : x.toFixed(1));
    legend.innerHTML = `<span>${escapeHtml(params.color)}</span><span>${fmt(lo)}</span><div class="ramp" style="background:${rampCss}"></div><span>${fmt(hi)}</span>`;
  };

  const personButton = (j, d) =>
    `<button data-who="${escapeHtml(names[j])}">${escapeHtml(names[j])}</button> <span class="dim">${metrics[params.metric].format(d, traits.length)}</span>`;

  const updatePanel = () => {
    const metric = metrics[params.metric];
    const i = names.indexOf(params.who);
    if (i < 0) {
      panel.innerHTML = `
        <p><strong>Tap anyone</strong> to see who they answered most like. Drag to turn, pinch or scroll to zoom.</p>
        <p class="dim long">${metric.description}</p>
        <p class="dim">${traits.length} answers can't fit in 3D exactly: distances here are off by ${Math.round(100 * layout.stress)}% (root mean square). Lines link each person to their ${numSkeleton} most similar across all ${traits.length} answers, so a long line marks a pair 3D pulls apart.</p>`;
      return;
    }
    const {ranked, dist} = layout;
    const near = ranked[i].slice(0, numNear);
    const far = ranked[i].slice(-numNear).reverse();
    const near3d = names
      .map((_, j) => j)
      .filter((j) => j !== i)
      .sort((a, b) => layout.fit[i][a] - layout.fit[i][b])
      .slice(0, numNear);
    const kept = near.filter((j) => near3d.includes(j)).length;

    const byAnswer = traits
      .map((t) => [t, data[i].answers[t]])
      .sort((a, b) => b[1] - a[1]);
    const traitList = (list) =>
      list
        .map(([t, v]) => `${escapeHtml(t)} <span class="dim">${v}</span>`)
        .join(', ');

    panel.innerHTML = `
      <button class="close" aria-label="Close">×</button>
      <h2>${escapeHtml(params.who)}${params.who === me ? ' <span class="dim">(you)</span>' : ''}</h2>
      <p><span class="same">Most similar</span>: ${near.map((j) => personButton(j, dist[i][j])).join(', ')}</p>
      <p><span class="diff">Most different</span>: ${far.map((j) => personButton(j, dist[i][j])).join(', ')}</p>
      <p class="dim">Numbers are ${metric.unit}. ${kept} of these ${numNear} most similar are also among the ${numNear} dots nearest them in 3D.</p>
      <p>Highest: ${traitList(byAnswer.slice(0, 3))}<br/>Lowest: ${traitList(byAnswer.slice(-3).reverse())}</p>
      <p><a href="../peopleStats/#${names[i].replace(/\W/g, '')}">More about them →</a></p>`;
  };

  const select = (who) => {
    params.who = who;
    whoController.updateDisplay();
    saveUrl();
    updatePanel();
  };

  const gui = new GUI();
  gui
    .add(
      params,
      'metric',
      Object.fromEntries(Object.entries(metrics).map(([k, m]) => [m.name, k])),
    )
    .name('Compare by')
    .onChange((key) => {
      setMetric(key);
      saveUrl();
      updatePanel();
    });
  gui
    .add(params, 'color', ['Average answer', ...traits])
    .name('Color by')
    .onChange(() => {
      updateColors();
      saveUrl();
    });
  const whoController = gui
    .add(params, 'who', {
      '(nobody)': '',
      ...Object.fromEntries([...names].sort().map((n) => [n, n])),
    })
    .name('Find')
    .onChange(select);
  gui.add(params, 'spin').name('Spin');
  if (innerWidth < 600) gui.close();

  panel.addEventListener('click', (e) => {
    if (e.target.dataset.who) select(e.target.dataset.who);
    else if (e.target.classList.contains('close')) select('');
  });

  const renderer = new Renderer(canvas);
  const {camera} = renderer;

  // Drag to orbit, with a little momentum. Pinch or wheel to zoom. Tap to
  // select. Spinning pauses while someone is touching it.
  const pointers = new Map();
  let lastInteraction = -Infinity;
  let velocity = 0;
  let pinchStart;
  let downAt;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    downAt = {x: e.clientX, y: e.clientY, moved: false};
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        distance: camera.distance,
      };
    }
    velocity = 0;
    lastInteraction = performance.now();
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      canvas.classList.toggle(
        'pointing',
        renderer.pick(e.clientX, e.clientY) >= 0,
      );
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6)
      downAt.moved = true;
    if (pointers.size === 1) {
      const speed = 3 / Math.min(innerWidth, innerHeight);
      camera.yaw -= dx * speed;
      camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + dy * speed));
      velocity = -dx * speed;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      camera.distance = Math.max(
        1.5,
        Math.min(10, (pinchStart.distance * pinchStart.d) / d),
      );
      downAt.moved = true;
    }
    lastInteraction = performance.now();
  });
  const pointerUp = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0) canvas.classList.remove('dragging');
    if (e.type === 'pointerup' && !downAt.moved && pointers.size === 0) {
      const i = renderer.pick(e.clientX, e.clientY);
      select(i >= 0 && names[i] !== params.who ? names[i] : '');
      velocity = 0;
    }
    lastInteraction = performance.now();
  };
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.distance = Math.max(
        1.5,
        Math.min(10, camera.distance * Math.exp(e.deltaY * 0.001)),
      );
      lastInteraction = performance.now();
    },
    {passive: false},
  );

  const edgesFor = (i) => {
    const {ranked} = layout;
    if (i < 0) {
      const seen = new Set();
      const edges = [];
      for (const [a, list] of ranked.entries()) {
        for (const b of list.slice(0, numSkeleton)) {
          const key = Math.min(a, b) * names.length + Math.max(a, b);
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({a, b, color: '#fff', alpha: 0.28});
        }
      }
      return edges;
    }
    return [
      ...ranked[i]
        .slice(-numNear)
        .map((b) => ({a: i, b, color: '#f88', alpha: 0.7, dash: true})),
      ...ranked[i]
        .slice(0, numNear)
        .map((b) => ({a: i, b, color: '#9f9', alpha: 0.95, width: 2})),
    ];
  };

  updateColors();
  updatePanel();
  saveUrl();
  status.remove();

  let lastTime = performance.now();
  const loop = (time) => {
    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    const ease = 1 - Math.exp(-dt * 3);
    for (const [i, p] of current.entries()) {
      for (let k = 0; k < 3; k++) p[k] += (layout.pos[i][k] - p[k]) * ease;
    }

    if (!pointers.size) {
      camera.yaw += velocity;
      velocity *= Math.exp(-dt * 3);
      const idle = time - lastInteraction > 4000;
      if (params.spin && idle) camera.yaw += dt * 0.12;
    }

    const i = names.indexOf(params.who);
    const highlighted = new Set(
      i < 0
        ? names.keys()
        : [
            i,
            ...layout.ranked[i].slice(0, numNear),
            ...layout.ranked[i].slice(-numNear),
          ],
    );
    // On a phone the panels span the screen, so center the cloud between
    // them, easing as the panel changes size.
    const narrow = innerWidth < 600;
    const top = narrow ? header.getBoundingClientRect().bottom : 0;
    const bottom = narrow ? panel.getBoundingClientRect().top : innerHeight;
    renderer.view.top += (top - renderer.view.top) * ease;
    renderer.view.bottom += (bottom - renderer.view.bottom) * ease;

    renderer.render({
      points: current.map((pos, j) => ({
        pos,
        name: names[j],
        color: colors[j],
        emphasis: highlighted.has(j) ? 1 : 0.25,
        ring: j === i ? '#fff' : names[j] === me ? '#fc4' : '',
      })),
      edges: edgesFor(i),
      focus: i,
    });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

main().catch((e) => {
  console.error(e);
  status.textContent = `Couldn't load the survey: ${e.message}`;
});
