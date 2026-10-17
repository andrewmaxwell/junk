import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {clusterOrder, neighborConsistency, pca} from './analysis.js';
import {correlationCoefficient} from './correlationCoefficient.js';
import {getData} from './getData.js';
import {makePeopleGraph} from './makePeopleGraph.js';

const metrics = {
  raw: {
    name: 'Raw answers',
    distance: (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
      return Math.sqrt(sum);
    },
    format: (d) => d.toFixed(1),
    description:
      'Similarity is the distance between two sets of answers. Much of it comes down to how highly people rated themselves overall, which is the most consistent thing the survey measures.',
  },
  profile: {
    name: 'Profile (correlation)',
    // 1 - r, so 0 is identical and 2 is opposite. Ignores how high or low
    // someone rated themselves overall and compares the shape of their answers.
    distance: (a, b) => 1 - correlationCoefficient(a, b),
    format: (d) => (1 - d).toFixed(2),
    description: `Similarity is the correlation between two people's answers, ignoring how highly they rated themselves overall. Be skeptical of it: when the survey is split in half, the two halves barely agree on who is similar to whom, so the percentages here are low.`,
  },
};

const numFactors = 3;
const numCorrelations = 15;
const num = 5;

const escapeHtml = (str) =>
  str.replace(
    /[&<>"']/g,
    (c) =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        c
      ],
  );

const toId = (str) => str.replace(/\W/g, '');
const nameLink = (name) => `<a href="#${toId(name)}">${escapeHtml(name)}</a>`;

const mean = (arr) => arr.reduce((sum, x) => sum + x, 0) / arr.length;
const median = (arr) => {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Percent of vals below val, counting ties as half.
const percentile = (val, vals) =>
  (100 *
    (vals.filter((v) => v < val).length +
      vals.filter((v) => v === val).length / 2)) /
  vals.length;
const rankLabel = (pct) =>
  pct >= 50
    ? `top ${Math.max(1, Math.round(100 - pct))}%`
    : `bottom ${Math.max(1, Math.round(pct))}%`;

const heatmap = (labels, cell) => {
  const headers = labels
    .map((label) => `<th><div><span>${label}</span></div></th>`)
    .join('');
  const rows = labels
    .map(
      (label, r) =>
        `<tr><th>${label}</th>${labels.map((_, c) => cell(r, c)).join('')}</tr>`,
    )
    .join('');
  return `
  <table>
    <thead><tr><th></th>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
};
const heatmapCell = (color, title) =>
  `<td style="background:${color}" title="${escapeHtml(title)}"></td>`;

const similarityTable = (data, dist, metric) => {
  const colorThreshold = median(
    dist.flatMap((row, i) => row.filter((_, j) => j !== i)),
  );
  const order = clusterOrder(dist);

  return `
  <p>Green means more similar. Red means different. The bright green diagonal is because everyone is 100% similar to themselves.<p>
  <p>People are grouped so that those with similar answers sit next to each other, so green blocks along the diagonal are groups of similar people.</p>
  ${heatmap(
    order.map((i) => nameLink(data[i].name)),
    (r, c) => {
      const d = dist[order[r]][order[c]];
      const color =
        d < colorThreshold
          ? `rgba(0,255,0,${1 - d / colorThreshold})`
          : `rgba(255,0,0,${d / colorThreshold - 1})`;
      return heatmapCell(
        color,
        `${data[order[r]].name} & ${data[order[c]].name}: ${metric.format(d)}`,
      );
    },
  )}`;
};

const consistencyNote = `The percentage next to each name is how often they came out in the top ${num} when only a random half of the questions was used. High percentages are solid; low ones could easily have been someone else.`;

// Each person's most similar and most different, ordered by how consistently
// they come out that way across random halves of the survey.
const closestPeople = (data, consistency, metric, i) => {
  const list = (freqs) =>
    freqs[i]
      .map((freq, j) => ({freq, j, score: data[i].scores[data[j].name]}))
      .filter(({freq, j}) => freq > 0 && j !== i)
      .sort((a, b) => b.freq - a.freq)
      .slice(0, num)
      .map(
        ({freq, j, score}) =>
          `<span title="${escapeHtml(`Score: ${metric.format(score)}`)}">${nameLink(data[j].name)} <span class="paren">${Math.round(100 * freq)}%</span></span>`,
      )
      .join(', ');
  return {alike: list(consistency.near), different: list(consistency.far)};
};

const getMostAndLeast = (data, consistency, metric) =>
  `<p>${metric.description}</p><p>${consistencyNote}</p>` +
  data
    .map((row, i) => {
      const {alike, different} = closestPeople(data, consistency, metric, i);
      return `
      <br/>
      <h3 id="${toId(row.name)}">${escapeHtml(row.name)}<button>hide</button></h3>
      <strong>Most Similar</strong>: ${alike}<br/>
      <strong>Most Different</strong>: ${different}<br/>`;
    })
    .join('');

const meView = (data, traits, factors, consistency, metric, name) => {
  const i = data.findIndex((d) => d.name === name);
  if (i < 0) {
    return `<p>Pick your name next to <strong>Me</strong> in the Controls panel (top right) to see how you compare with everyone.</p>`;
  }
  const me = data[i];
  const others = data.filter((_, j) => j !== i);
  const {alike, different} = closestPeople(data, consistency, metric, i);

  const rows = traits.keys
    .map((key) => {
      const vals = others.map((d) => d.answers[key]);
      const mine = me.answers[key];
      return {key, mine, avg: mean(vals), pct: percentile(mine, vals)};
    })
    .sort((a, b) => b.pct - a.pct)
    .map(
      ({key, mine, avg, pct}) => `
      <div>${key}</div>
      <div class="track">
        <div class="bar" style="width:${mine * 10}%"></div>
        <div class="avg" style="left:${avg * 10}%"></div>
      </div>
      <div class="paren">${mine}, ${rankLabel(pct)}</div>`,
    )
    .join('');

  const factorRanks = factors
    .map(
      (f, k) =>
        `Factor ${k + 1}: ${rankLabel(
          percentile(
            f.scores[i],
            f.scores.filter((_, j) => j !== i),
          ),
        )}`,
    )
    .join(', ');

  return `
  <h2>${escapeHtml(name)}</h2>
  <strong>Most Similar</strong>: ${alike}<br/>
  <strong>Most Different</strong>: ${different}
  <p class="paren">${consistencyNote}</p>
  <p>The yellow bar is your answer and the white line is everyone else's average, sorted from where you rank highest to lowest.</p>
  <div class="me-traits">${rows}</div>
  <p>On the <a href="#factors">trait factors</a>: ${factorRanks}</p>`;
};

const answerHistograms = (data, traits, name) => {
  const me = data.find((d) => d.name === name);
  const hists = traits.keys
    .map((key, j) => {
      const groups = [...Array(10)].map(() => []);
      for (const d of data) groups[d.answers[key] - 1]?.push(d.name);
      const most = Math.max(...groups.map((g) => g.length));
      const bars = groups
        .map((names, v) => {
          const mine = me?.answers[key] === v + 1 ? 'mine' : '';
          const title = escapeHtml(`${v + 1}: ${names.join(', ')}`);
          return `<div class="${mine}" style="height:${(100 * names.length) / most}%" title="${title}"></div>`;
        })
        .join('');
      const axis = groups.map((_, v) => `<span>${v + 1}</span>`).join('');
      return `
      <div>
        <h4>${key} <span class="paren">avg ${mean(traits.columns[j]).toFixed(1)}</span></h4>
        <div class="bars">${bars}</div>
        <div class="axis">${axis}</div>
      </div>`;
    })
    .join('');
  return `<p>Hover over a bar to see who gave that answer.${
    me ? ' Your answers are yellow.' : ''
  }</p><div class="hists">${hists}</div>`;
};

const getShowAll = (hidden) =>
  hidden.length
    ? `<p>
        Some people are hidden: ${escapeHtml(hidden.join(', '))}.
        <button>Show All</button>
      </p>`
    : '';

const correlationTable = ({keys, corr}) => {
  const order = clusterOrder(corr.map((row) => row.map((c) => 1 - c)));
  return `<h1>Answer Correlations</h1>
  <p>Green means positively correlated. Red means negatively correlated. Black means no correlation. Traits are grouped so related ones sit next to each other.<p>
  ${heatmap(
    order.map((i) => keys[i]),
    (r, c) => {
      const [i, j] = [order[r], order[c]];
      const value = i === j ? 1 : corr[i][j];
      const color =
        value < 0 ? `rgba(255,0,0,${-value})` : `rgba(0,255,0,${value})`;
      return heatmapCell(color, `${keys[i]} & ${keys[j]}: ${value.toFixed(2)}`);
    },
  )}`;
};

const correlationList = ({keys, corr}) => {
  const pairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      pairs.push({a: keys[i], b: keys[j], correlation: corr[i][j]});
    }
  }
  pairs.sort((a, b) => b.correlation - a.correlation);
  const list = (items) =>
    items
      .map(
        ({a, b, correlation}) =>
          `<div>${a} & ${b} <span class="paren">${correlation.toFixed(2)}</span></div>`,
      )
      .join('');

  return `<h1>Correlations</h1>
  <p>Out of ${pairs.length} pairs of traits, these are the ones people answered most and least alike.</p>
  <div class="cols">
    <div><h3>Most related</h3>${list(pairs.slice(0, numCorrelations))}</div>
    <div><h3>Least related</h3>${list(pairs.slice(-numCorrelations).reverse())}</div>
  </div>`;
};

const factorPanel = (data, traits, factors) => {
  const pct = (x) => `${Math.round(100 * x)}%`;
  const total = factors.reduce((sum, f) => sum + f.explained, 0);

  const sections = factors
    .map((f, k) => {
      const sorted = traits.keys
        .map((key, j) => ({key, loading: f.loadings[j]}))
        .sort((a, b) => b.loading - a.loading);
      const traitList = (items) =>
        items
          .map(
            ({key, loading}) =>
              `${key} <span class="paren">${loading.toFixed(2)}</span>`,
          )
          .join(', ');
      const people = data
        .map((d, i) => ({name: d.name, score: f.scores[i]}))
        .sort((a, b) => b.score - a.score);
      const peopleList = (items) =>
        items.map(({name}) => nameLink(name)).join(', ');
      const oneWay = f.loadings.every((l) => l > 0);

      return `
      <h3>Factor ${k + 1} <span class="paren">${pct(f.explained)} of variation</span></h3>
      ${oneWay ? '<p>Every trait points the same way, so this one is mostly how highly someone rated themselves overall.</p>' : ''}
      <div><strong>${oneWay ? 'Most tied to it' : 'High end'}</strong>: ${traitList(sorted.slice(0, num))}</div>
      <div><strong>${oneWay ? 'Least tied to it' : 'Low end'}</strong>: ${traitList(sorted.slice(-num).reverse())}</div>
      <div><strong>Highest</strong>: ${peopleList(people.slice(0, 3))}</div>
      <div><strong>Lowest</strong>: ${peopleList(people.slice(-3).reverse())}</div>`;
    })
    .join('');

  return `<h1 id="factors">Trait Factors</h1>
  <p>The ${traits.keys.length} traits aren't independent. People's answers mostly vary along a few underlying patterns, found here with principal component analysis. These ${factors.length} biggest patterns account for ${pct(total)} of the variation in everyone's answers. The numbers next to each trait show how strongly it's tied to the pattern.</p>
  ${sections}`;
};

const peopleGraph = () => `
  <p>Everyone is placed on the two strongest patterns in the answers (see <a href="#factors">Trait Factors</a> below). Left to right is how highly people rated themselves overall, top to bottom is the second pattern, and color is the third (orange and blue ends are named in the corner). Both axes are stretched to fill the space.</p>
  <p>A flat picture can't show 36 traits faithfully, so being close here doesn't always mean being similar. Names that don't fit are shown as dots. Hover over or tap a dot to see who it is and draw lines to the people most consistently similar to them. Brighter lines are more consistent.</p>
  <canvas id="peopleGraph"></canvas>`;

const loadMe = () => {
  try {
    return localStorage.getItem('peopleStatsMe') || '';
  } catch {
    return '';
  }
};
const saveMe = (name) => {
  try {
    localStorage.setItem('peopleStatsMe', name);
  } catch {
    // Not remembered, which is fine.
  }
};

const main = async () => {
  const params = new URLSearchParams(location.search);
  const setParam = (key, val) => {
    if (val) params.set(key, val);
    else params.delete(key);
    location.href = location.pathname + (params.size ? `?${params}` : '');
  };

  const hidden = params.get('hide')?.split(',') || [];
  const metricKey = metrics[params.get('metric')]
    ? params.get('metric')
    : 'raw';
  const metric = metrics[metricKey];

  const hash = location.hash.slice(1);
  location.hash = '';

  const data = await getData(hidden, metric.distance);
  const dist = data.map((a) => data.map((b) => a.scores[b.name]));
  const keys = Object.keys(data[0].answers);
  const columns = keys.map((key) => data.map((d) => d.answers[key]));
  const traits = {
    keys,
    columns,
    corr: columns.map((a) => columns.map((b) => correlationCoefficient(a, b))),
  };
  const factors = pca(columns, traits.corr, numFactors);
  const consistency = neighborConsistency(
    data.map((d) => Object.values(d.answers)),
    metric.distance,
    num,
    200,
  );

  document.body.innerHTML += [
    getShowAll(hidden),
    '<h1>Results</h1>',
    '<div id="me"></div>',
    peopleGraph(),
    similarityTable(data, dist, metric),
    getMostAndLeast(data, consistency, metric),
    '<h1>How People Answered</h1><div id="histograms"></div>',
    correlationTable(traits),
    correlationList(traits),
    factorPanel(data, traits, factors),
  ].join('');

  const highlight = makePeopleGraph(
    'peopleGraph',
    data,
    factors,
    keys,
    consistency.near,
  );

  const showMe = (name) => {
    saveMe(name);
    document.querySelector('#me').innerHTML = meView(
      data,
      traits,
      factors,
      consistency,
      metric,
      name,
    );
    document.querySelector('#histograms').innerHTML = answerHistograms(
      data,
      traits,
      name,
    );
    highlight(name);
  };

  // After the innerHTML write above, which would otherwise rebuild it.
  const gui = new GUI();
  gui
    .add(
      {metric: metricKey},
      'metric',
      Object.fromEntries(Object.entries(metrics).map(([k, m]) => [m.name, k])),
    )
    .name('Compare by')
    .onChange((key) => setParam('metric', key === 'raw' ? '' : key));

  const names = data.map((d) => d.name).sort();
  const me = names.includes(loadMe()) ? loadMe() : '';
  gui
    .add({me}, 'me', {
      '(nobody)': '',
      ...Object.fromEntries(names.map((n) => [n, n])),
    })
    .name('Me')
    .onChange(showMe);
  showMe(me);

  document.addEventListener('click', (e) => {
    switch (e.target.textContent.toLowerCase()) {
      case 'hide': {
        const name = e.target.previousSibling.textContent;
        setParam('hide', [...hidden, name].join(','));
        break;
      }
      case 'show all': {
        setParam('hide');
      }
    }
  });

  if (hash) location.hash = hash;
};

main();
