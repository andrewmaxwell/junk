// Time-to-target benchmark. Targets affect measurement/stopping only, never
// initialization or search. A numerical match is not a proof of optimality.
// node benchmark-time.mjs --seeds 5 --ms 2000 --output results.json
import { PackingSolver } from './solver.js';
import { validateLayout } from './validate.js';
import { CASES } from './benchmark-cases.js';
import { writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`--${name} needs a value`);
  return args[i + 1];
}
const seeds = Number(flag('seeds', 5));
const budgetMs = Number(flag('ms', 2000));
const attempts = Number(flag('attempts', 5));
const order = flag('order', 'forward');
const rotationPolicy = flag('rotation', 'staged');
const only = flag('only', '');
const output = flag('output', null);
const includeReferences = args.includes('--references');
const thresholds = [1, 0.1, 0.01]; // relative error in linear scale, percent
if (![seeds, attempts].every((n) => Number.isInteger(n) && n > 0) ||
    !Number.isFinite(budgetMs) || budgetMs <= 0 ||
    !['forward', 'alternating'].includes(order) || !['staged', 'free'].includes(rotationPolicy)) {
  throw new Error('Use positive seeds/attempts/ms and --order forward|alternating, --rotation staged|free');
}
const cases = CASES.filter((c) => (includeReferences || c.source === 'proven') && c.name.includes(only));
if (!cases.length) throw new Error('No matching cases');
const median = (values) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (v, digits = 1) => v == null ? '—' : v.toFixed(digits);
const report = {
  createdAt: new Date().toISOString(), runtime: process.version,
  machine: `${platform()} ${arch()} ${cpus()[0]?.model || ''}`,
  budgetMs, attempts, seeds, thresholdsPercent: thresholds, relaxationOrder: order, rotationPolicy,
  note: 'Node wall time includes construction and validation, excludes worker startup/rendering. Hit means feasible within the specified scale gap, not exact optimality. Timing medians include successful runs only; misses are reported separately. Each run ends on the strictest target, time budget, or attempt exhaustion. One atomic solver step can slightly exceed the time budget.',
  results: [],
};
// Untimed warm-up keeps most first-use compilation out of the first case.
const warm = new PackingSolver({ seed: 0, relaxationOrder: order, rotationPolicy, count: 5 });
for (let i = 0; i < 300 && !warm.done; i++) warm.step();
console.log(`Budget ${budgetMs} ms / ${attempts} attempts per run; ${seeds} seeds. Times are medians of hits only.`);
console.log('case'.padEnd(25), '≤1% hits/ms'.padEnd(17), '≤0.1% hits/ms'.padEnd(17), '≤0.01% hits/ms'.padEnd(17), 'best/median gap %');
let invalid = false;
for (const c of cases) {
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const start = performance.now();
    const solver = new PackingSolver({
      itemShape: c.item, containerShape: c.container, count: c.count,
      attempts, seed, relaxationOrder: order, rotationPolicy,
    });
    const hits = thresholds.map(() => null);
    let bestScale = Infinity;
    let gapPercent = null;
    let error = null;
    let steps = 0;
    while (!solver.done && performance.now() - start < budgetMs) {
      solver.step();
      steps++;
      if (solver.best && solver.best.scale < bestScale) {
        const checked = validateLayout(solver.best.items, solver.best.container, solver.config.feasibleTolerance);
        if (!checked.ok) { error = checked.problems.join('; '); break; }
        bestScale = solver.best.scale;
        gapPercent = (bestScale / c.target - 1) * 100;
        if (c.source === 'proven' && gapPercent < -0.05) { error = 'Beat a proven bound beyond numerical tolerance'; break; }
        const now = performance.now() - start;
        thresholds.forEach((target, i) => {
          if (hits[i] === null && gapPercent <= target && now <= budgetMs) hits[i] = now;
        });
      }
      if (hits.every((h) => h !== null)) break;
    }
    if (error) invalid = true;
    runs.push({ seed, config: solver.config, hitsMs: hits, gapPercent,
      bestScale: Number.isFinite(bestScale) ? bestScale : null, elapsedMs: performance.now() - start,
      iterations: steps, hops: solver.hops, acceptedHops: solver.acceptedHops,
      stop: error ? 'invalid' : hits.every((h) => h !== null) ? 'target' : solver.done ? 'attempts' : 'timeout', error });
  }
  const timing = thresholds.map((threshold, i) => {
    const hits = runs.map((r) => r.hitsMs[i]).filter((t) => t !== null);
    return { threshold, successes: hits.length, total: seeds, medianMs: median(hits) };
  });
  const gaps = runs.map((r) => r.gapPercent).filter((v) => v !== null);
  const summary = { case: c, timing, bestGapPercent: gaps.length ? Math.min(...gaps) : null,
    medianGapPercent: median(gaps), noSolution: runs.filter((r) => r.bestScale === null).length, runs };
  report.results.push(summary);
  console.log(c.name.padEnd(25), ...timing.map((t) => `${t.successes}/${seeds} ${fmt(t.medianMs)}ms`.padEnd(17)),
    `${fmt(summary.bestGapPercent, 3)} / ${fmt(summary.medianGapPercent, 3)}`);
}
if (output) { writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(`Saved ${output}`); }
process.exitCode = invalid ? 1 : 0;
