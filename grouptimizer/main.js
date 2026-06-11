import StatGraph from './statGraph.js';
import {makeReport} from './makeReport.js';
import {getGroupStats, makeSolver} from './solver.js';
import {getData} from './getData.js';
import {makeAttendanceTable} from './makeAttendanceTable.js';

const outputDiv = /** @type {HTMLDivElement} */ (
  document.querySelector('#output')
);
const numGroupsInput = /** @type {HTMLInputElement} */ (
  document.querySelector('#numGroups')
);
const emailLink = /** @type {HTMLAnchorElement} */ (
  document.querySelector('#email')
);
const attendanceTable = /** @type {HTMLTableElement} */ (
  document.querySelector('#attendance')
);
const groupsDiv = /** @type {HTMLDivElement} */ (
  document.querySelector('#groups')
);

const stats = new StatGraph(document.querySelector('#statCanvas'));
const annealingGraph = stats.addGraph({color: 'red'});
const temperatureGraph = stats.addGraph({color: 'green', forceMin: 0});

/** @import SimulatedAnnealer from './SimulatedAnnealer.js' */
/** @import {Person} from './solver.js' */
/** @type {SimulatedAnnealer<Person[][]>} */
let solver;

/** @type {Person[]} */
let people;
try {
  people = await getData();
  console.log(people);
} catch (err) {
  outputDiv.innerText = `Could not load data. Check your connection and reload.\n\n${err}`;
  throw err;
}

// Simulated annealing is stochastic and can settle into a local minimum, so we
// run it several times from different random starts and keep the best result.
const RESTARTS = 5;

// A job is a list of independent "segments" to optimize in sequence. Mixed mode
// is one segment (everyone); gendered mode is two (boys, girls) — each balanced
// within its own gender — whose results are concatenated into one grouping.
/** @typedef {{people: Person[], numGroups: number, runsLeft: number, best: {state: Person[][], cost: number} | null}} Segment */
/** @type {{segments: Segment[], current: number, label: string} | null} */
let job = null;

const startSegment = () => {
  if (!job) return;
  const seg = job.segments[job.current];
  solver = makeSolver(seg.numGroups, seg.people);
  stats.reset();
};

const round = (n) => Math.round(n * 10) / 10;

/** @param {Person[]} group */
const sortedNames = (group) =>
  group
    .slice()
    .sort(
      (a, b) => Number(a.sponsor) - Number(b.sponsor) || a.contrib - b.contrib,
    )
    .map((p) => (p.sponsor ? `${p.name} (leader)` : p.name));

/**
 * @param {Person[][]} state
 * @param {string} [metaText] */
const renderGroups = (state, metaText) => {
  const cards = state
    .map((g) => {
      const s = getGroupStats(g);
      const bits = [
        `${s.students} student${s.students === 1 ? '' : 's'}`,
        `${s.girls}♀ / ${s.boys}♂`,
        `avg contribution ${round(s.contribAverage)}`,
        `spread ${round(s.contribStdev)}`,
      ];
      if (s.weightSum) bits.push(`pair score ${s.weightSum}`);
      return `<div class="group"><div class="names">${sortedNames(g).join(
        ', ',
      )}</div><div class="groupStats">${bits.join(' · ')}</div></div>`;
    })
    .join('');
  groupsDiv.innerHTML =
    (metaText ? `<div class="meta">${metaText}</div>` : '') + cards;
};

/** @param {Person[][]} state */
const groupsAsText = (state) =>
  state
    .map((g, i) => `Group ${i + 1}: ${sortedNames(g).join(', ')}`)
    .join('\n');

const loop = () => {
  for (let i = 0; !solver.isDone && i < 2000; i++) {
    solver.iterate();
  }

  if (!solver.isDone) {
    requestAnimationFrame(loop);
    annealingGraph(solver.currentCost);
    if (solver.temperature !== undefined) {
      temperatureGraph(solver.temperature);
    }
    stats.draw();
    return;
  }

  if (!job) return;
  const seg = job.segments[job.current];
  if (!seg.best || solver.minCost < seg.best.cost) {
    seg.best = {state: solver.bestState, cost: solver.minCost};
  }

  // More restarts for this segment?
  if (--seg.runsLeft > 0) {
    startSegment();
    requestAnimationFrame(loop);
    return;
  }

  // On to the next segment (e.g. girls after boys)?
  if (++job.current < job.segments.length) {
    startSegment();
    requestAnimationFrame(loop);
    return;
  }

  // All segments done — combine and show.
  const combined = job.segments.flatMap((s) => s.best?.state ?? []);
  renderGroups(combined, job.label);
  updateEmail(combined);
  saveResult(combined);
};

const resize = () => {
  stats.resize(window.innerWidth, 300);
};
window.addEventListener('resize', resize);
resize();

/** @param {Person[]} people @param {number} numGroups @returns {Segment} */
const makeSegment = (people, numGroups) => ({
  people,
  numGroups,
  runsLeft: RESTARTS,
  best: null,
});

/**
 * Split `total` groups across genders so group SIZES come out as even as
 * possible: each present gender gets at least one group, none gets more groups
 * than it has students, and extra groups go to whichever gender is most crowded.
 * @param {number} total
 * @param {Record<string, number>} counts student count per gender
 * @returns {Record<string, number>} groups per gender (only genders with students) */
const allocateGroups = (total, counts) => {
  const genders = Object.keys(counts).filter((g) => counts[g] > 0);
  if (genders.length === 0) return {};
  const totalStudents = genders.reduce((s, g) => s + counts[g], 0);
  const groups = Math.max(genders.length, Math.min(total, totalStudents));
  const alloc = Object.fromEntries(genders.map((g) => [g, 1]));
  for (let left = groups - genders.length; left > 0; left--) {
    let pick = null;
    for (const g of genders) {
      if (alloc[g] >= counts[g]) continue;
      if (!pick || counts[g] / alloc[g] > counts[pick] / alloc[pick]) pick = g;
    }
    if (!pick) break;
    alloc[pick]++;
  }
  return alloc;
};

document.querySelectorAll('.go').forEach((button) => {
  button.addEventListener('click', async function () {
    const num = Number(numGroupsInput.value) || 4;
    const present = people.filter((p) => !p.absent);

    /** @type {Segment[]} */
    let segments;
    let label;

    if (button.getAttribute('data-mode') === 'gender') {
      // `num` total groups, split between the genders so sizes stay even.
      const alloc = allocateGroups(num, {
        f: present.filter((p) => !p.sponsor && p.gender === 'f').length,
        m: present.filter((p) => !p.sponsor && p.gender === 'm').length,
      });
      segments = Object.entries(alloc).map(([g, groups]) =>
        makeSegment(
          present.filter((p) => p.gender === g),
          groups,
        ),
      );
      const parts = [];
      if (alloc.f) parts.push(`${alloc.f} girls'`);
      if (alloc.m) parts.push(`${alloc.m} boys'`);
      label = `Single-gender groups (${parts.join(', ')})`;
    } else {
      // Mixed mode: the number input is the number of groups.
      if (present.filter((p) => !p.sponsor).length < num) {
        groupsDiv.innerHTML = '<p>Not enough people for that many groups.</p>';
        return;
      }
      segments = [makeSegment(present, num)];
      label = `Mixed groups`;
    }

    if (segments.length === 0) {
      groupsDiv.innerHTML = '<p>Not enough people to make groups.</p>';
      return;
    }

    groupsDiv.innerHTML = '<p>Optimizing…</p>';
    job = {segments, current: 0, label};
    startSegment();
    loop();
  });
});

numGroupsInput.value = String(
  Math.min(
    people.filter((p) => !p.absent && p.sponsor).length,
    Math.floor(people.filter((p) => !p.absent && !p.sponsor).length / 4),
  ),
);

const reportText = makeReport(people);
outputDiv.innerText = reportText;
attendanceTable.innerHTML = makeAttendanceTable(people);

// Recipients come from the Email column of non-hidden rows (getData drops hidden
// rows), deduped.
const recipients = [
  ...new Set(people.map((p) => p.email).filter(Boolean)),
].join(',');

/** Rebuild the email link, optionally including the small-group assignments. */
const updateEmail = (/** @type {Person[][] | null} */ state) => {
  const subject = encodeURIComponent(`Attendance ${new Date().toDateString()}`);
  const groupsText = state ? `Small Groups\n${groupsAsText(state)}\n\n` : '';
  const body = encodeURIComponent(groupsText + reportText);
  emailLink.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
};

// --- Persist the last grouping, keyed to a signature of the inputs that affect
// it. If the sheet has changed since, the saved grouping is stale and discarded.
const STORAGE_KEY = 'grouptimizer:lastResult';
const inputSignature = JSON.stringify(
  people.map((p) => [
    p.name,
    p.absent,
    p.sponsor,
    p.gender,
    p.contrib,
    p.weights,
  ]),
);

const saveResult = (/** @type {Person[][]} */ state) => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sig: inputSignature,
      groups: state.map((g) => g.map((p) => p.name)),
      time: Date.now(),
    }),
  );
};

const restoreResult = () => {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!saved || saved.sig !== inputSignature) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  const byName = new Map(people.map((p) => [p.name, p]));
  const state = saved.groups.map((names) =>
    names.map((n) => byName.get(n)).filter(Boolean),
  );
  // Bail if any name failed to resolve (shouldn't happen if the sig matched).
  if (!state.every((g, i) => g.length === saved.groups[i].length)) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  renderGroups(
    state,
    `Saved grouping from ${new Date(
      saved.time,
    ).toLocaleString()} — click a button to regenerate`,
  );
  return state;
};

updateEmail(restoreResult());
