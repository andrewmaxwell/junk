// Regression test against packings whose answer is known independently.
//
//   node benchmark.mjs [--seeds N] [--attempts N] [--only substring] [--quick]
//
// Two things are checked for every case:
//
//   1. Feasibility. Every reported layout is re-checked from the geometry by
//      validate.js, so a "solution" that cheats the solver's own tolerance is a
//      hard failure regardless of how good its scale looks.
//   2. Quality. `gap` is how much wider the found container is than the target,
//      in percent. A gap above the case's tolerance fails. A *negative* gap
//      against a `proven` target is also a failure -- it would mean beating a
//      theorem, which in practice means a bug in the geometry or the scoring.
//
// Targets are quoted as `scale`: the side of the square with the container's
// area, which is what the solver minimises. For a square container that is
// literally the side length, so the classic square-in-square results can be
// compared directly.
//
// Exits non-zero if anything fails, so it can gate a commit.

import { PackingSolver } from './solver.js';
import { validateLayout } from './validate.js';

import { CASES } from './benchmark-cases.js';

const args = process.argv.slice(2);
const flag = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : args[i + 1];
};
const quick = args.includes('--quick');
const seeds = Number(flag('seeds', quick ? 2 : 6));
const attempts = Number(flag('attempts', quick ? 2 : 4));
const only = flag('only', null);
// Quality tolerances are calibrated for the default restart budget. --quick
// runs a fraction of it, so it is a smoke test of feasibility rather than of
// how close to optimal the search gets; loosen the bar to match.
const tolScale = quick ? 6 : 1;

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('case', 24), pad('source', 12), pad('target', 9), pad('found', 9), pad('gap %', 8), 'ms');

let failures = 0;
let gapSum = 0;
let counted = 0;
for (const c of CASES) {
  if (only && !c.name.includes(only)) continue;
  const t0 = Date.now();
  let best = null;
  const notes = [];
  for (let s = 1; s <= seeds; s++) {
    const solver = new PackingSolver({
      itemShape: c.item, containerShape: c.container, count: c.count,
      attempts, seed: s, ...(c.config || {}),
    });
    while (solver.step());
    if (!solver.best) {
      notes.push(`seed ${s} found nothing`);
      continue;
    }
    const check = validateLayout(
      solver.best.items, solver.best.container, solver.config.feasibleTolerance,
    );
    if (!check.ok) notes.push(`seed ${s} infeasible: ${check.problems.join('; ')}`);
    if (!best || solver.best.scale < best) best = solver.best.scale;
  }
  const gap = best === null ? Infinity : (best / c.target - 1) * 100;
  if (best === null) notes.push('no layout at all');
  else if (gap > c.tol * tolScale) notes.push(`gap ${gap.toFixed(2)}% exceeds ${(c.tol * tolScale).toFixed(2)}%`);
  else if (gap < -0.05 && c.source === 'proven') notes.push(`beat a proven optimum by ${(-gap).toFixed(2)}% -- check the geometry`);

  console.log(
    pad(c.name, 24), pad(c.source, 12), pad(c.target.toFixed(4), 9),
    pad(best === null ? '-' : best.toFixed(4), 9),
    pad(Number.isFinite(gap) ? gap.toFixed(2) : '-', 8), Date.now() - t0,
    notes.length ? `\n    FAIL  ${notes.join('\n    FAIL  ')}` : '',
  );
  if (notes.length) failures++;
  if (Number.isFinite(gap)) { gapSum += gap; counted++; }
}

console.log(`\nmean gap ${(gapSum / counted).toFixed(3)}%   ${failures} failing case(s)`);
process.exit(failures ? 1 : 0);
