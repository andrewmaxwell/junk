import assert from 'node:assert/strict';
import {
  example,
  child,
  calculate,
  workload,
  scenarios,
  NEWBORN_MONTHS,
  sanitize,
  MODEL_VERSION,
  MAX_CHILDREN,
  TASKS,
  addedChild,
} from './model.js';
let checks = 0;
const check = (v, msg) => {
  assert.ok(v, msg);
  checks++;
};
// Gives every child a task.
const all = (s, k) => s.children.forEach((c) => (c[k] = true));
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
all(meals, 'feeding');
check(
  calculate(meals).warnings.some((x) => x.includes('Food')),
  'allergy plan prompt',
);
check(
  !base.warnings.some((x) => x.includes('Food')),
  'no unnecessary food premium',
);
const LEVELS = ['none', 'occasional', 'frequent', 'constant'];
const WEIGHTS_COPY = () => structuredClone(example().weights);
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
  // Mix tasks and parents, not just the children.
  s.parents = rand() < 0.5;
  for (const c of s.children)
    for (const field of TASKS.map(([k]) => k)) c[field] = rand() < 0.5;
  s.base = 8 + rand() * 20;
  const r = calculate(s);
  check(r.rate >= 0 && Number.isFinite(r.total), 'finite nonnegative');
  check(Math.abs(r.each * s.caregivers - r.rate) < 1e-8, 'pay splits');
  check(Math.abs(r.total - r.rate * s.hours) < 1e-8, 'duration total');
  for (const field of ['diapers', 'feeding', 'bath', 'bed']) {
    const next = structuredClone(s);
    next.children[0][field] = true;
    check(calculate(next).rate >= r.rate, 'task monotonic ' + field);
    all(next, field);
    check(calculate(next).rate >= r.rate, 'all-children task ' + field);
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
all(tuned, 'diapers');
const plain = example();
all(plain, 'diapers');
check(calculate(tuned).rate > calculate(plain).rate, 'weights drive the rate');
// Andrew's guesses (October 2026) of the hourly pay that would make the
// second caregiver happy in each scenario, against the reference session's
// $12.50. The weights were fitted to these, keeping tasks away from the group
// dearer for a lone caregiver. The solo guesses don't fit one straight line
// (Eliam alone nearly matches all five alone), so Andrew chose Eliam closer to
// his guess: the lone-caregiver premium starts early (soloFree), which puts
// "alone" and "alone with diapers" about $5 over theirs.
const bump = (fn) => {
  const s = example();
  fn(s);
  return calculate(s);
};
const GUESSES = [
  ['diapers', 15, 1, (s) => all(s, 'diapers')],
  ['dinner', 14, 1, (s) => all(s, 'feeding')],
  ['bedtime', 20, 1, (s) => all(s, 'bed')],
  ['alone', 25, 5, (s) => (s.caregivers = 1)],
  [
    'alone with diapers',
    28,
    6.5,
    (s) => {
      s.caregivers = 1;
      all(s, 'diapers');
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
    'alone with Eliam, parents away',
    25,
    6,
    (s) => {
      s.caregivers = 1;
      s.parents = false;
      s.children = [s.children[4]];
    },
  ],
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
const moderate = bump((s) => all(s, 'feeding')).rate;
check(
  bump((s) => all(s, 'diapers')).rate > moderate &&
    bump((s) => all(s, 'bed')).rate > moderate,
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
all(teamDiapers, 'diapers');
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
  all(s, 'feeding');
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
  v: MODEL_VERSION,
  base: -10,
  hours: '3',
  parents: evil,
  children: [
    {name: 5, months: 'x', attention: evil, settle: 7, hue: evil},
    null,
    {...child('Ok', 30), comfort: 'active', settle: 60},
  ],
  weights: {
    included: '0.6',
    premium: evil,
    supervision: [{months: -50, value: evil}],
    attention: {frequent: -1},
  },
});
check(dirty.base === 0 && dirty.hours === 2, 'numbers clamped or defaulted');
check(dirty.parents === true, 'wrong type replaced');
check(
  !('play' in sanitize({...example(), play: 'led'})),
  'removed fields are dropped',
);
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
    dirty.weights.attention.frequent === 0,
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
// Weights saved under another model version are dropped, not misread.
const oldSave = {...example(), weights: {...WEIGHTS_COPY(), heavyLoad: 1}};
check(
  sanitize(oldSave).weights.heavyLoad === example().weights.heavyLoad,
  'old-version weights dropped',
);
check(
  sanitize({...oldSave, v: MODEL_VERSION}).weights.heavyLoad === 1,
  'current-version weights kept',
);
check(
  sanitize({...example(), v: MODEL_VERSION, weights: {included: 0}}).weights
    .included > 0,
  'included can never be zero',
);
// The one-to-one warning uses the same capped settling time as pricing.
const sleeper = example();
sleeper.caregivers = 1;
sleeper.children = [
  {...child('A', 18), settle: 999, comfort: 'active', sleep: 100},
  child('B', 48),
];
check(
  !calculate(sleeper).warnings.some((x) => x.includes('one-to-one')),
  'no one-to-one warning for a sleeping child',
);
// Two caregivers, two children each needing one of them: nobody left over.
const twoDedicated = example();
twoDedicated.children = [
  {...child('A', 18), settle: 999, comfort: 'active'},
  {...child('B', 18), settle: 999, comfort: 'active'},
  child('C', 48),
  child('D', 48),
];
check(
  calculate(twoDedicated).warnings.some((x) => x.includes('2 children need')),
  'team-wide one-to-one warning',
);
// One caregiver, two children each needing them throughout: one is left over.
const twoForOne = example();
twoForOne.caregivers = 1;
twoForOne.children = twoDedicated.children.slice(0, 2);
check(
  calculate(twoForOne).warnings.some((x) => x.includes('one-to-one')),
  'more one-to-one children than caregivers warns',
);
twoForOne.caregivers = 2;
check(
  !calculate(twoForOne).warnings.some((x) => x.includes('one-to-one')),
  'one caregiver per one-to-one child is fine',
);
// The newborn comparison respects the child limit.
const full = example();
full.children = Array.from({length: MAX_CHILDREN}, () => child());
scenarios.find(([id]) => id === 'baby')[2](full);
check(full.children.length === MAX_CHILDREN, 'newborn scenario capped');
// Parents away with nobody on diapers is flagged, not silently priced.
const gone = example();
gone.parents = false;
check(
  calculate(gone).warnings.some((x) => x.includes('nobody is assigned')),
  'parents away without diapers warns',
);
all(gone, 'diapers');
check(
  !calculate(gone).warnings.some((x) => x.includes('nobody is assigned')),
  'assigned diapers clears it',
);
// Tasks are per child: one child's bath costs less than everyone's.
const oneBath = example();
oneBath.children[0].bath = true;
const allBaths = example();
all(allBaths, 'bath');
check(
  calculate(example()).raw < calculate(oneBath).raw &&
    calculate(oneBath).raw < calculate(allBaths).raw,
  'per-child tasks scale with the children who have them',
);
check(
  workload(oneBath).rows[1].bath === 0,
  "another child's task costs nothing",
);
// Food precautions only count for a child who is fed.
const fedOther = example();
fedOther.children[1].feeding = true;
check(
  workload(fedOther).rows[0].allergy === 0 &&
    !calculate(fedOther).warnings.some((x) => x.includes('Food')),
  'allergy only matters when that child eats',
);
// The diapers prompt names the children nobody is assigned to.
const partly = example();
partly.parents = false;
all(partly, 'diapers');
partly.children[1].diapers = false;
check(
  calculate(partly).warnings.some((x) => x.includes('for Layla.')),
  'unassigned diapers names the child',
);
// Old plans kept tasks on the plan; they apply to every child.
const legacy = sanitize({
  ...example(),
  diapers: true,
  children: [
    {name: 'A', months: 20},
    {name: 'B', months: 30, diapers: false},
  ],
});
check(
  legacy.children[0].diapers && !legacy.children[0].bath,
  'old plan-wide tasks migrate to each child',
);
check(!legacy.children[1].diapers, 'a per-child value wins over the plan');
check(!('diapers' in legacy), 'no plan-level tasks after loading');
// New children take on the tasks every child already has.
const allDiapers = example();
all(allDiapers, 'diapers');
allDiapers.children[0].bed = true;
const added = addedChild(allDiapers);
check(added.diapers && !added.bed, 'added child inherits shared tasks');
check(!addedChild({children: []}).diapers, 'first child starts with no tasks');
// A lone caregiver's premium starts below the reference load, so a hard
// single child costs more than an easy pair; teams are unaffected.
const soloEliam = bump((s) => {
  s.caregivers = 1;
  s.children = [s.children[4]];
});
const soloEasy = bump((s) => {
  s.caregivers = 1;
  s.children = [s.children[0], s.children[2]];
});
check(soloEliam.each > soloEasy.each, 'hard child alone costs more');
check(base.covered === 2 * WEIGHTS_COPY().included, 'team premium unchanged');
console.log('PASS ' + checks + ' model checks');
