import assert from 'node:assert/strict';
import {
  example,
  child,
  calculate,
  workload,
  scenarios,
  NEWBORN_MONTHS,
  sanitize,
} from './model.js';
let checks = 0;
const check = (v, msg) => {
  assert.ok(v, msg);
  checks++;
};
const base = calculate(example());
check(
  base.rate === 25 && base.each === 12.5 && base.total === 50,
  'reference payment',
);
for (const [id, name, fn] of scenarios) {
  const s = example();
  fn(s);
  const r = calculate(s);
  check(Number.isFinite(r.rate), name);
  if (id === 'solo') {
    check(r.each > base.each, 'solo per-person premium');
    check(
      r.warnings.some((x) => x.includes('Heavy')),
      'solo backup prompt',
    );
  } else check(r.rate > base.rate, name + ' increases rate');
  console.log(name + ': $' + r.rate + '/hr team; $' + r.each + '/hr each');
}
const solo = example();
solo.children = [child('Independent', 132)];
solo.caregivers = 1;
const soloFloor = 12.5 + solo.weights.soloBonus;
check(
  calculate(solo).rate === soloFloor,
  'one easy child: base + sole caregiver',
);
solo.children[0] = {...child('Newborn', 0.75), settle: 999, comfort: 'active'};
// Base pay covers most of one person's attention (the reference session was
// busy), so even a newborn needing one-to-one soothing throughout stays at the
// floor. It must never cost less than an easy child.
check(calculate(solo).rate >= soloFloor, 'active newborn not below the floor');
const empty = example();
empty.children = [];
check(calculate(empty).total === 0, 'no children no cost');
const sleep = example();
sleep.children = [{...child('Baby', 1), sleep: 100, settle: 999}];
check(workload(sleep).total > 0, 'sleep retains supervision');
check(workload(sleep).rows[0].settling === 0, 'sleep removes active soothing');
const meals = example();
meals.feeding = true;
check(
  calculate(meals).warnings.some((x) => x.includes('Food')),
  'allergy plan prompt',
);
check(
  !base.warnings.some((x) => x.includes('Food')),
  'no unnecessary food premium',
);
const LEVELS = ['none', 'occasional', 'frequent', 'constant'];
let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let k = 0; k < 500; k++) {
  const s = example();
  s.hours = 0.5 + rand() * 7.5;
  s.caregivers = 1 + Math.floor(rand() * 4);
  s.children = Array.from({length: 1 + Math.floor(rand() * 8)}, (_, i) => ({
    ...child('Child ' + i, rand() * 180),
    attention: LEVELS[Math.floor(rand() * 4)],
    settle: rand() * 180,
    sleep: rand() * 100,
  }));
  const r = calculate(s);
  check(r.rate >= 0 && Number.isFinite(r.total), 'finite nonnegative');
  check(Math.abs(r.each * s.caregivers - r.rate) < 1e-8, 'pay splits');
  check(Math.abs(r.total - r.rate * s.hours) < 1e-8, 'duration total');
  for (const field of ['diapers', 'feeding', 'bath', 'bed']) {
    const next = structuredClone(s);
    next[field] = true;
    check(calculate(next).rate >= r.rate, 'task monotonic ' + field);
  }
  const next = structuredClone(s);
  next.children.push(child());
  check(calculate(next).rate >= r.rate, 'adding child monotonic');
  next.children.pop();
  const level = LEVELS.indexOf(next.children[0].attention);
  next.children[0].attention = LEVELS[Math.min(3, level + 1)];
  check(calculate(next).rate >= r.rate, 'attention monotonic');
  const longer = structuredClone(s);
  longer.hours += 0.5;
  check(
    calculate(longer).total + 1 >= r.total,
    'longer total sensible within rounding',
  );
}
const unnamed = example();
unnamed.children[1].name = '  ';
check(workload(unnamed).rows[1].name === 'Child 2', 'blank name fallback');
const saved = JSON.parse(JSON.stringify(example()));
check(calculate(saved).rate === base.rate, 'weights survive storage');
const edge = example();
edge.children = [child('Edge', NEWBORN_MONTHS - 0.25)];
check(
  calculate(edge).warnings.some((x) => x.includes('Newborn')),
  'newborn warning below boundary',
);
edge.children[0].months = NEWBORN_MONTHS;
check(
  !calculate(edge).warnings.some((x) => x.includes('Newborn')),
  'newborn warning ends at the boundary',
);
const tuned = example();
tuned.weights.premium = 40;
tuned.diapers = true;
const plain = example();
plain.diapers = true;
check(calculate(tuned).rate > calculate(plain).rate, 'weights drive the rate');
// Andrew's guesses (October 2026) of the hourly pay that would make the
// second caregiver happy in each scenario, against the reference session's
// $12.50. The weights were fitted to these, keeping tasks away from the group
// dearer for a lone caregiver, which leaves "alone" a little under the guess.
const bump = (fn) => {
  const s = example();
  fn(s);
  return calculate(s);
};
const GUESSES = [
  ['diapers', 15, 1, (s) => (s.diapers = true)],
  ['dinner', 14, 1, (s) => (s.feeding = true)],
  ['bedtime', 20, 1, (s) => (s.bed = true)],
  ['alone', 25, 1.25, (s) => (s.caregivers = 1)],
  [
    'alone with diapers',
    28,
    1,
    (s) => {
      s.caregivers = 1;
      s.diapers = true;
    },
  ],
  [
    'easy job alone',
    15,
    1,
    (s) => {
      s.caregivers = 1;
      s.children = [s.children[0], s.children[2]];
    },
  ],
  ['four hours', 12.5, 0.01, (s) => (s.hours = 4)],
  [
    'newborn',
    13,
    1.25,
    (s) => s.children.push({...child('Baby', 0.75), sleep: 50, settle: 30}),
  ],
];
for (const [name, guess, tolerance, fn] of GUESSES) {
  const r = bump(fn);
  check(
    Math.abs(r.each - guess) <= tolerance,
    `${name}: $${r.each} each, guessed $${guess}`,
  );
}
const alone = bump((s) => (s.caregivers = 1));
check(alone.rate > base.rate / 2, 'solo quote is not simply halved');
const moderate = bump((s) => (s.feeding = true)).rate;
check(
  bump((s) => (s.diapers = true)).rate > moderate &&
    bump((s) => (s.bed = true)).rate > moderate,
  'dinner is the lightest task',
);
const easy = example();
easy.children.forEach((c) => (c.sleep = 100));
check(calculate(easy).rate === base.rate, 'easy or asleep still pays base');
// Ages change smoothly: no jump on a birthday.
for (let m = 0; m < 200; m += 0.25) {
  const a = example();
  a.children = [child('A', m)];
  const b = structuredClone(a);
  b.children[0].months = m + 0.25;
  check(
    Math.abs(workload(b).total - workload(a).total) < 0.01,
    'smooth at ' + m + ' months',
  );
}
// Away tasks cost the lone caregiver more than a team member.
const teamDiapers = example();
teamDiapers.diapers = true;
const soloDiapers = structuredClone(teamDiapers);
soloDiapers.caregivers = 1;
const plainSolo = example();
plainSolo.caregivers = 1;
check(
  workload(soloDiapers).total - workload(plainSolo).total >
    workload(teamDiapers).total - workload(example()).total,
  'away tasks cost more alone',
);
// Food precautions are per meal, so the booking's cost for them doesn't grow
// with its length.
const precautionCost = (hours) => {
  const s = example();
  s.hours = hours;
  s.feeding = true;
  return workload(s).rows[0].allergy * hours;
};
check(
  Math.abs(precautionCost(6) - precautionCost(2)) < 1e-9,
  'food precautions per meal',
);
// Parents away adds the no-backup share.
const away = example();
away.parents = false;
check(workload(away).total > workload(example()).total, 'sole responsibility');
// Staffing prompts, not just price.
check(
  alone.warnings.some((x) => x.includes('children per caregiver')),
  'solo children-per-caregiver prompt',
);
check(
  !base.warnings.some((x) => x.includes('per caregiver')),
  'reference within staffing limits',
);
const toddlers = example();
toddlers.children = [child('A', 10), child('B', 14), child('C', 20)];
toddlers.caregivers = 1;
check(
  calculate(toddlers).warnings.some((x) => x.includes('under 2')),
  'under-2 prompt',
);
const soloBaby = example();
soloBaby.caregivers = 1;
soloBaby.children = [child('Baby', 0.75)];
check(
  calculate(soloBaby).warnings.some((x) => x.includes('one caregiver')),
  'newborn alone prompt',
);
// Untrusted plans (shared links, old saves) come back as clean values.
const evil = '<img src=x onerror=alert(1)>';
const dirty = sanitize({
  ...example(),
  base: -10,
  hours: '3',
  play: evil,
  children: [
    {name: 5, months: 'x', attention: evil, settle: 7, hue: evil},
    null,
    {...child('Ok', 30), comfort: 'active', settle: 60},
  ],
  weights: {
    included: '0.6',
    premium: evil,
    supervision: [{months: -50, value: evil}],
    play: {led: -1},
  },
});
check(dirty.base === 0 && dirty.hours === 2, 'numbers clamped or defaulted');
check(dirty.play === 'together', 'unknown option replaced');
check(dirty.children.length === 2, 'non-object children dropped');
check(
  dirty.children[0].name === 'Child 1' &&
    dirty.children[0].months === 48 &&
    dirty.children[0].attention === 'none' &&
    dirty.children[0].settle === 0 &&
    !('hue' in dirty.children[0]),
  'bad child fields replaced',
);
check(dirty.children[1].settle === 60, 'good child fields kept');
check(
  JSON.stringify(dirty.weights.supervision) ===
    JSON.stringify(example().weights.supervision) &&
    dirty.weights.included === example().weights.included &&
    dirty.weights.premium === example().weights.premium &&
    dirty.weights.play.led === 0,
  'bad weights replaced, anchors fixed, negatives clamped',
);
const json = JSON.stringify(sanitize(JSON.parse(JSON.stringify(dirty))));
check(!json.includes('<'), 'nothing markup-like survives');
check(
  sanitize('nope') === null && sanitize(null) === null,
  'non-objects rejected',
);
check(
  JSON.stringify(sanitize(example())) === JSON.stringify(example()),
  'clean plans pass through unchanged',
);
// Settling minutes count as entered; sleep only caps them at awake time.
const settleRow = (sleep, settle = 60) => {
  const s = example();
  s.children = [{...child('A', 18), settle, sleep}];
  return workload(s).rows[0].settling;
};
check(
  Math.abs(settleRow(50) - settleRow(0)) < 1e-9,
  'sleep does not shrink entered settling',
);
check(settleRow(75) < settleRow(0), 'settling capped at awake time');
// One caregiver can't give one child full attention and watch the others.
const oneToOne = example();
oneToOne.caregivers = 1;
oneToOne.children = [
  {...child('A', 48), settle: 999, comfort: 'active'},
  child('B', 48),
  child('C', 48),
  child('D', 48),
];
check(
  calculate(oneToOne).warnings.some((x) => x.includes('one-to-one')),
  'one-to-one with one caregiver warns',
);
console.log('PASS ' + checks + ' model checks');
