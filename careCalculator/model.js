// Children younger than this get the newborn prompts.
export const NEWBORN_MONTHS = 3;
// Bump when a weight or rule changes meaning. Links and saves carry it, and
// sanitize() drops weights saved under another version rather than misread
// them (version 2: heavyLoad became a multiple of the reference load;
// version 3: added soloFree).
export const MODEL_VERSION = 3;
export const MAX_CHILDREN = 30;

// Every tunable number in the model. The math, the "All workload assumptions"
// text and the lil-gui panel all read from this table.
//
// Points are relative units, calibrated to the reference session (the
// example), which carries `included` points per caregiver. They are not a
// literal share of a person's attention: Andrew's guesses priced one-to-one
// consoling barely above holding, which no literal attention scale supports.
// Tasks are real minutes of a caregiver's time divided by the booking's
// minutes, times a factor for how much the task competes with watching the
// group.
//
// Age-based values are anchors ({months, value}) with straight lines between
// them, so nothing jumps on a birthday. Ages past the last anchor use its
// value.
export const WEIGHTS = {
  // Points per caregiver covered by base pay. Calibrated so the example
  // (5 children, 2 caregivers, 2 hours) costs exactly base pay; fixed so that
  // editing the example doesn't silently change every quote. The point weights
  // are scaled so that session, which Andrew called easy and enjoyable, keeps
  // each caregiver about 60% busy.
  included: 0.595,
  premium: 15, // $/hr per point above the included workload
  // $/hr for being the only one in charge, with nobody to tag in. Applies
  // even when the children are easy.
  soloBonus: 2.5,
  // A lone caregiver's premium starts above this multiple of `included`,
  // not at the full reference load: one person on their own feels a harder
  // child sooner. Set just above Andrew's "easy job alone" (Johnny and Eden,
  // 0.39×), so that stays at base pay, while his "alone with Eliam" guess
  // rises toward $25.
  soloFree: 0.4,
  heavyLoad: 1.7, // warn above this multiple of the included load per caregiver
  supervision: [
    {months: 0, value: 0.17},
    {months: 12, value: 0.21},
    {months: 24, value: 0.15},
    {months: 36, value: 0.12},
    {months: 60, value: 0.08},
    {months: 96, value: 0.06},
    {months: 144, value: 0.03},
  ],
  asleepSupervision: 0.4, // share of supervision kept while asleep
  attention: {none: 0, occasional: 0.03, frequent: 0.14, constant: 0.35},
  settling: {holding: 0.21, active: 0.35}, // points while settling
  soleResponsibility: 0.15, // share of supervision added when parents are away
  // Tasks that take a caregiver out of the room. With a team, the others
  // stretch to cover the group; alone, the caregiver also has to manage the
  // group while doing the task.
  away: {team: 1.11, solo: 1.39},
  // Tasks done in the room with the group (feeding). Partly overlaps with
  // supervising, so it counts less than its full minutes.
  inRoom: 0.35,
  toiletingPerHour: {diaper: 3, help: 2.5, independent: 0}, // minutes, away
  feedingMinutes: [
    {months: 0, value: 25},
    {months: 12, value: 15},
    {months: 36, value: 8},
  ],
  allergyMinutes: 10, // per meal, per child with food precautions, in-room
  bathMinutes: 15, // away
  bedMinutes: [
    // away
    {months: 36, value: 24},
    {months: 60, value: 10.5},
  ],
  // Staffing warnings. These raise a prompt rather than the price.
  maxChildrenPerCaregiver: 4,
  maxUnder2PerCaregiver: 2,
};

export const childName = (c, i) => c.name.trim() || `Child ${i + 1}`;
// Tasks the caregivers can take on, set per child.
export const TASKS = [
  ['diapers', 'Diapers & potty'],
  ['feeding', 'Meal / bottles'],
  ['bath', 'Bathing'],
  ['bed', 'Bedtime'],
];
export function byAge(anchors, months) {
  const next = anchors.findIndex((a) => months < a.months);
  if (next === -1) return anchors[anchors.length - 1].value;
  if (next === 0) return anchors[0].value;
  const a = anchors[next - 1];
  const b = anchors[next];
  return (
    a.value +
    ((b.value - a.value) * (months - a.months)) / (b.months - a.months)
  );
}

export const child = (name = 'New child', months = 48) => ({
  name,
  months,
  attention: 'none',
  settle: 0,
  comfort: 'holding',
  sleep: 0,
  toilet: months < 36 ? 'diaper' : months < 60 ? 'help' : 'independent',
  allergy: false,
  ...Object.fromEntries(TASKS.map(([k]) => [k, false])),
});
// A child added to a plan takes on the tasks every child there already has.
export const addedChild = (s, ...args) => ({
  ...child(...args),
  ...Object.fromEntries(
    TASKS.map(([k]) => [
      k,
      s.children.length > 0 && s.children.every((c) => c[k]),
    ]),
  ),
});
export function example() {
  return {
    hours: 2,
    caregivers: 2,
    base: 12.5,
    parents: true,
    children: [
      {...child('Johnny', 48), allergy: true},
      child('Layla', 24),
      {...child('Eden', 48), attention: 'occasional'},
      {...child('Nora', 18), attention: 'occasional', settle: 60},
      {
        ...child('Eliam', 18),
        attention: 'frequent',
        settle: 60,
        comfort: 'active',
      },
    ],
    weights: structuredClone(WEIGHTS),
  };
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const awakeShare = (c) => 1 - c.sleep / 100;
// Settling minutes count as entered, up to the child's awake time. Pricing
// and the staffing warning both use this.
export const settleMinutes = (c, minutes) =>
  Math.min(c.settle, minutes * awakeShare(c));
export function workload(s) {
  const w = s.weights;
  const minutes = s.hours * 60;
  const away = s.caregivers === 1 ? w.away.solo : w.away.team;
  const rows = s.children.map((c, i) => {
    const awake = awakeShare(c);
    const supervision =
      byAge(w.supervision, c.months) *
      (w.asleepSupervision + (1 - w.asleepSupervision) * awake);
    const attention = w.attention[c.attention] * awake;
    const settling =
      (settleMinutes(c, minutes) / minutes) * w.settling[c.comfort];
    const toileting = c.diapers
      ? (w.toiletingPerHour[c.toilet] / 60) * away
      : 0;
    const feeding = c.feeding
      ? (byAge(w.feedingMinutes, c.months) / minutes) * w.inRoom
      : 0;
    const bath = c.bath ? (w.bathMinutes / minutes) * away : 0;
    const bed = c.bed ? (byAge(w.bedMinutes, c.months) / minutes) * away : 0;
    const allergy =
      c.feeding && c.allergy ? (w.allergyMinutes / minutes) * w.inRoom : 0;
    return {
      name: childName(c, i),
      supervision,
      attention,
      settling,
      toileting,
      feeding,
      bath,
      bed,
      allergy,
      total: sum([
        supervision,
        attention,
        settling,
        toileting,
        feeding,
        bath,
        bed,
        allergy,
      ]),
    };
  });
  // No backup when parents are away: a share of supervision.
  const environment = s.parents
    ? 0
    : w.soleResponsibility * sum(rows.map((r) => r.supervision));
  return {
    rows,
    environment,
    total: sum(rows.map((r) => r.total)) + environment,
  };
}
export function calculate(s) {
  const w = workload(s);
  const {included, premium, heavyLoad} = s.weights;
  const n = s.caregivers;
  const load = w.total / n;
  // Workload covered by base pay, in points.
  const covered = n === 1 ? included * s.weights.soloFree : n * included;
  const extra = premium * Math.max(0, w.total - covered);
  const solo = n === 1 ? s.weights.soloBonus : 0;
  const raw = s.children.length ? n * s.base + solo + extra : 0;
  // Babysitters are usually paid in cash, so each caregiver's pay for the
  // booking rounds to a whole dollar and the hourly figures follow from it.
  const pay = Math.round((raw / n) * s.hours);
  const rate = (pay * n) / s.hours;
  const newborn = s.children.some((c) => c.months < NEWBORN_MONTHS);
  const under2 = s.children.filter((c) => c.months < 24).length;
  const {maxChildrenPerCaregiver, maxUnder2PerCaregiver} = s.weights;
  const warnings = [];
  if (s.children.length > maxChildrenPerCaregiver * n)
    warnings.push(
      `More than ${maxChildrenPerCaregiver} children per caregiver. Consider another caregiver rather than a higher price.`,
    );
  if (under2 > maxUnder2PerCaregiver * n)
    warnings.push(
      `More than ${maxUnder2PerCaregiver} children under 2 per caregiver. Consider another caregiver rather than a higher price.`,
    );
  if (load > included * heavyLoad)
    warnings.push(
      `Heavy workload: each caregiver carries more than ${heavyLoad}× the reference session’s load. Review task assignments and arrange backup before agreeing to this quote.`,
    );
  // Children who tie up a caregiver one-to-one for at least half the booking.
  // If they take every caregiver and anyone is left over (another child, or
  // more of them than caregivers), nobody is free to watch them.
  const minutes = s.hours * 60;
  const dedicated = s.children.filter(
    (c) => c.comfort === 'active' && settleMinutes(c, minutes) >= minutes / 2,
  ).length;
  if (dedicated >= n && s.children.length > n)
    warnings.push(
      `${dedicated === 1 ? 'One child needs' : `${dedicated} children need`} one-to-one settling for much of the booking, leaving nobody free to watch the others. Consider another caregiver.`,
    );
  const unassigned = s.children
    .map((c, i) => (!c.diapers && c.toilet !== 'independent' ? i : -1))
    .filter((i) => i >= 0)
    .map((i) => childName(s.children[i], i));
  if (!s.parents && unassigned.length)
    warnings.push(
      `Parents are away, but nobody is assigned diapers & potty for ${unassigned.join(', ')}. Add the task, or confirm ${unassigned.length === 1 ? 'they' : 'those children'} won’t need it.`,
    );
  if (newborn)
    warnings.push(
      'Newborn: agree who handles waking, bottles and settling, and confirm each caregiver’s comfort with the role.',
    );
  if (newborn && n === 1)
    warnings.push(
      'Newborn with one caregiver: nobody can cover the group while the baby needs both hands.',
    );
  if (newborn && !s.parents)
    warnings.push(
      'Your newborn preference is parents nearby; this arrangement does not meet it.',
    );
  if (s.children.some((c) => c.feeding && c.allergy))
    warnings.push(
      'Food precautions: confirm the child’s instructions and emergency plan with parents.',
    );
  if (s.children.length === 0)
    warnings.push('Add a child to calculate a quote.');
  return {
    ...w,
    workload: w.total,
    load,
    covered,
    solo,
    extra,
    raw,
    rate,
    pay,
    each: pay / s.hours,
    total: pay * n,
    warnings,
  };
}
// Task options apply to every child.
const forAll = (k) => (s) => s.children.forEach((c) => (c[k] = true));
export const scenarios = [
  ['diapers', 'We handle potty & diapers', forAll('diapers')],
  ['feeding', 'Add a meal / bottles', forAll('feeding')],
  ['bed', 'Include bedtime', forAll('bed')],
  [
    'baby',
    'Add a newborn',
    (s) =>
      s.children.length < MAX_CHILDREN &&
      s.children.push({
        ...addedChild(s, 'Baby brother', 0.75),
        sleep: 50,
        settle: 30,
      }),
  ],
  ['solo', 'One caregiver', (s) => (s.caregivers = 1)],
  ['away', 'Parents leave', (s) => (s.parents = false)],
];

// Rebuilds a plan from untrusted input (a shared link or old save), keeping
// only known fields of the right type and range. Anything else falls back to
// the example's value, so rendered values are always plain numbers, booleans
// and known option names.
const SETTLE = [0, 10, 30, 60, 999];
const numIn = (v, lo, hi, fallback) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, v))
    : fallback;
const oneOf = (v, options, fallback) => (options.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
// Same shape as the defaults; numbers must be finite and non-negative. Anchor
// ages stay fixed so the interpolation order can't break.
// `included` is a divisor and heavyLoad a multiple of it, so both need floors.
const WEIGHT_MIN = {included: 0.05, heavyLoad: 1};
function mergeWeights(dflt, raw, key) {
  if (typeof dflt === 'number')
    return numIn(raw, WEIGHT_MIN[key] ?? 0, 1000, dflt);
  if (Array.isArray(dflt))
    return dflt.map((d, i) =>
      mergeWeights(d, Array.isArray(raw) ? raw[i] : undefined),
    );
  return Object.fromEntries(
    Object.entries(dflt).map(([k, d]) => [
      k,
      k === 'months' ? d : mergeWeights(d, raw?.[k], k),
    ]),
  );
}
// Plans saved before tasks were per child carry them on the plan; those apply
// to every child.
function sanitizeChild(raw, i, plan) {
  if (!raw || typeof raw !== 'object') return null;
  const months = numIn(raw.months, 0, 216, 48);
  const d = child('', months);
  return {
    name:
      typeof raw.name === 'string' ? raw.name.slice(0, 40) : `Child ${i + 1}`,
    months,
    attention: oneOf(
      raw.attention,
      Object.keys(WEIGHTS.attention),
      d.attention,
    ),
    settle: oneOf(raw.settle, SETTLE, d.settle),
    comfort: oneOf(raw.comfort, Object.keys(WEIGHTS.settling), d.comfort),
    sleep: numIn(raw.sleep, 0, 100, d.sleep),
    toilet: oneOf(raw.toilet, Object.keys(WEIGHTS.toiletingPerHour), d.toilet),
    allergy: bool(raw.allergy, d.allergy),
    ...Object.fromEntries(
      TASKS.map(([k]) => [k, bool(raw[k], bool(plan[k], false))]),
    ),
    ...(Number.isInteger(raw.hue) && raw.hue >= 0 && raw.hue <= 8
      ? {hue: raw.hue}
      : {}),
  };
}
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const d = example();
  return {
    hours: numIn(raw.hours, 0.5, 12, d.hours),
    caregivers: Math.round(numIn(raw.caregivers, 1, 6, d.caregivers)),
    base: numIn(raw.base, 0, 150, d.base),
    parents: bool(raw.parents, d.parents),
    children: Array.isArray(raw.children)
      ? raw.children
          .slice(0, MAX_CHILDREN)
          .map((c, i) => sanitizeChild(c, i, raw))
          .filter(Boolean)
      : d.children,
    weights: mergeWeights(
      WEIGHTS,
      raw.v === MODEL_VERSION ? raw.weights : undefined,
    ),
  };
}
