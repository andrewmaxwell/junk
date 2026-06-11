import SimulatedAnnealer from './SimulatedAnnealer.js';
import {rand, randWhere, shuffled, variance} from './utils.js';

/**
 * @typedef {{
 *  name: string,
 *  sponsor: boolean,
 *  gender: 'm' | 'f',
 *  contrib: number,
 *  email: string,
 *  weights: Record<string, number>,
 *  dates: Date[],
 *  birthday: Date,
 *  score: number,
 *  absent: boolean,
 *  grade: number,
 * }} Person
 * */

// --- Objective weights ---
// Every term below is normalized to roughly the same [0, 1] scale, so these
// weights express *relative priority* and are easy to tune by hand.
// Higher cost = worse grouping.
const W_PAIR = 3; // satisfy pairing prefs: keep "+" pairs together, "-" apart
const W_CONTRIB = 2; // even out avg contribution so no group is all-quiet/all-loud
const W_SPREAD = 1; // reward each group having a *mix* of high & low contributors
const W_TALKER = 0.5; // nudge toward a strong contributor per group (tends to happen anyway)
const W_LONE = 1.5; // avoid leaving a lone girl among boys (or vice versa)
const W_SIZE = 2; // keep group sizes roughly even
const W_GENDER = 0.5; // (low priority) even out the gender ratio across groups

/**
 * Round-robin deal people into `numGroups`, sponsors first so they spread out
 * evenly. Order is shuffled so repeated calls give different starting points
 * (used by the multi-restart in main.js).
 * @type {(numGroups: number, people: Person[]) => Person[][]} */
const makeInitialState = (numGroups, people) => {
  /** @type {Person[][]} */
  const groups = Array.from({length: numGroups}, () => []);

  [
    ...shuffled(people.filter((p) => p.sponsor)),
    ...shuffled(people.filter((p) => !p.sponsor)),
  ].forEach((person, i) => {
    groups[i % numGroups].push(person);
  });

  return groups;
};

/**
 * @typedef {{
 *  students: number,
 *  boys: number,
 *  girls: number,
 *  genderRatio: number,
 *  contribAverage: number,
 *  contribStdev: number,
 *  maxContrib: number,
 *  weightSum: number,
 * }} GroupStats
 */

/**
 * @param {Person[]} group
 * @returns {GroupStats} */
export const getGroupStats = (group) => {
  let girls = 0;
  let boys = 0;
  let contrib = 0;
  let contribSq = 0;
  let maxContrib = 0;
  let students = 0;
  let weightSum = 0;

  for (let i = 0; i < group.length; i++) {
    const p = group[i];
    if (!p.sponsor) {
      students++;
      if (p.gender === 'f') girls++;
      else boys++;
      contrib += p.contrib;
      contribSq += p.contrib ** 2;
      if (p.contrib > maxContrib) maxContrib = p.contrib;
    }
    // weights are mirrored, so each in-group pair is counted exactly once
    for (let k = 0; k < i; k++) {
      weightSum += p.weights[group[k].name] ?? 0;
    }
  }

  const contribAverage = students ? contrib / students : 0;
  return {
    students,
    boys,
    girls,
    genderRatio: students ? girls / students : 0,
    contribAverage,
    contribStdev: students
      ? Math.sqrt(Math.max(0, contribSq / students - contribAverage ** 2))
      : 0,
    maxContrib,
    weightSum,
  };
};

/**
 * @param {Person[]} people
 * @param {number} numGroups */
const makeCostFn = (people, numGroups) => {
  const students = people.filter((p) => !p.sponsor);
  const studentContribs = students.map((p) => p.contrib);
  const avgContrib =
    studentContribs.reduce((s, c) => s + c, 0) / (students.length || 1);
  const globalFemaleRatio =
    students.filter((s) => s.gender === 'f').length / (students.length || 1);
  const avgGroupSize = students.length / numGroups || 1;
  const contribScale = avgContrib || 1;
  // Population spread of contribution; the spread reward aims for each group to
  // internally match this (i.e. contain a mix of high and low contributors).
  const globalContribStdev = Math.sqrt(variance(studentContribs)) || 1;

  // A student counts as a "talker" if their contrib is at least the
  // numGroups-th highest, so in the ideal case each group gets one of them.
  const sortedContribs = [...studentContribs].sort((a, b) => b - a);
  const talkerThreshold = sortedContribs.length
    ? sortedContribs[Math.min(numGroups, sortedContribs.length) - 1]
    : Infinity;

  // Largest pair-benefit achievable (everyone with everyone), used to scale the
  // pair term into ~[0, 1]. Only positive weights count; mirrored, so halve.
  let maxPairBenefit = 0;
  for (const p of people) {
    for (const name in p.weights) {
      if (p.weights[name] > 0) maxPairBenefit += p.weights[name];
    }
  }
  maxPairBenefit = maxPairBenefit / 2 || 1;

  // Cache group stats keyed by array identity. The move functions reuse the
  // exact array reference for every group they do NOT touch, so each iteration
  // only recomputes the 2-3 groups that changed instead of all of them. This
  // turns the per-iteration cost from O(n^2) into ~O(numGroups).
  /** @type {WeakMap<Person[], GroupStats>} */
  const cache = new WeakMap();
  /** @param {Person[]} g */
  const statsFor = (g) => {
    let s = cache.get(g);
    if (!s) cache.set(g, (s = getGroupStats(g)));
    return s;
  };

  const rmsNorm = (sqErr, scale) =>
    Math.sqrt(sqErr / numGroups) / (scale || 1);

  /** @param {Person[][]} groups */
  return (groups) => {
    let pairBenefit = 0;
    let contribSqErr = 0;
    let genderSqErr = 0;
    let sizeSqErr = 0;
    let spreadSum = 0;
    let groupsWithStudents = 0;
    let talkerless = 0;
    let lone = 0;

    for (const g of groups) {
      const s = statsFor(g);
      pairBenefit += s.weightSum;
      contribSqErr += (s.contribAverage - avgContrib) ** 2;
      genderSqErr += (s.genderRatio - globalFemaleRatio) ** 2;
      sizeSqErr += (s.students - avgGroupSize) ** 2;
      if (s.students > 0) {
        spreadSum += s.contribStdev;
        groupsWithStudents++;
        if (s.maxContrib < talkerThreshold) talkerless++;
      }
      if (s.boys >= 1 && s.girls >= 1 && (s.boys === 1 || s.girls === 1)) lone++;
    }

    const avgSpread = groupsWithStudents ? spreadSum / groupsWithStudents : 0;

    return (
      -W_PAIR * (pairBenefit / maxPairBenefit) +
      W_CONTRIB * rmsNorm(contribSqErr, contribScale) +
      -W_SPREAD * (avgSpread / globalContribStdev) +
      W_TALKER * (talkerless / numGroups) +
      W_LONE * (lone / numGroups) +
      W_SIZE * rmsNorm(sizeSqErr, avgGroupSize) +
      W_GENDER * rmsNorm(genderSqErr, 1)
    );
  };
};

// --- Move generators ---
// Each returns a new top-level array that shares the *exact* array reference of
// every group it didn't change (so the stats cache stays valid), and copies the
// groups it does change before mutating them.

/** @param {Person[]} group @param {boolean} sponsor */
const randPersonOfType = (group, sponsor) =>
  randWhere(group.length, (i) => !!group[i].sponsor === sponsor);

/**
 * Swap two same-type people (sponsor<->sponsor or student<->student) between
 * two groups. Preserves every group's size and sponsor count.
 * @param {Person[][]} grouping */
const swapMove = (grouping) => {
  const gi1 = rand(grouping.length);
  const g1 = grouping[gi1];
  if (g1.length === 0) return grouping;
  const pi1 = rand(g1.length);
  const isSponsor = !!g1[pi1].sponsor;

  const gi2 = randWhere(
    grouping.length,
    (r) => r !== gi1 && grouping[r].some((p) => !!p.sponsor === isSponsor),
  );
  if (gi2 < 0) return grouping;
  const g2 = grouping[gi2];
  const pi2 = randPersonOfType(g2, isSponsor);
  if (pi2 < 0) return grouping;

  const next = grouping.slice(0);
  next[gi1] = g1.slice(0);
  next[gi2] = g2.slice(0);
  next[gi1][pi1] = g2[pi2];
  next[gi2][pi2] = g1[pi1];
  return next;
};

/**
 * Relocate one student from one group to another. Changes group sizes (kept in
 * check by the size term). Sponsors never move, so each group keeps its
 * sponsor(s).
 * @param {Person[][]} grouping */
const studentMove = (grouping) => {
  const gi1 = rand(grouping.length);
  const g1 = grouping[gi1];
  // don't move the last person out of a group (would leave it empty)
  if (g1.length <= 1) return grouping;
  const pi1 = randPersonOfType(g1, false);
  if (pi1 < 0) return grouping;
  const gi2 = randWhere(grouping.length, (r) => r !== gi1);
  if (gi2 < 0) return grouping;

  const next = grouping.slice(0);
  next[gi1] = g1.slice(0);
  next[gi2] = grouping[gi2].slice(0);
  next[gi2].push(next[gi1].splice(pi1, 1)[0]);
  return next;
};

/**
 * Rotate one student each among three groups (g1->g2->g3->g1). Preserves all
 * group sizes but reassigns three students at once, which helps escape local
 * minima that single swaps can't.
 * @param {Person[][]} grouping */
const studentCycle = (grouping) => {
  if (grouping.length < 3) return swapMove(grouping);
  const gi1 = rand(grouping.length);
  const gi2 = randWhere(grouping.length, (r) => r !== gi1);
  const gi3 = randWhere(grouping.length, (r) => r !== gi1 && r !== gi2);
  if (gi2 < 0 || gi3 < 0) return grouping;

  const pi1 = randPersonOfType(grouping[gi1], false);
  const pi2 = randPersonOfType(grouping[gi2], false);
  const pi3 = randPersonOfType(grouping[gi3], false);
  if (pi1 < 0 || pi2 < 0 || pi3 < 0) return grouping;

  const next = grouping.slice(0);
  const c1 = (next[gi1] = grouping[gi1].slice(0));
  const c2 = (next[gi2] = grouping[gi2].slice(0));
  const c3 = (next[gi3] = grouping[gi3].slice(0));
  const a = c1[pi1];
  c1[pi1] = c3[pi3];
  c3[pi3] = c2[pi2];
  c2[pi2] = a;
  return next;
};

/** @param {Person[][]} grouping */
const generateNeighbor = (grouping) => {
  const r = Math.random();
  if (r < 0.5) return swapMove(grouping);
  if (r < 0.8) return studentMove(grouping);
  return studentCycle(grouping);
};

/**
 * @param {number} numGroups
 * @param {Person[]} filteredPeople */
export const makeSolver = (numGroups, filteredPeople) => {
  const getCost = makeCostFn(filteredPeople, numGroups);
  const initialState = makeInitialState(numGroups, filteredPeople);

  // Auto-calibrate the starting temperature to the actual cost scale, so the
  // annealer behaves consistently no matter how the objective is weighted.
  // We sample uphill moves and aim for ~80% acceptance of them at the start.
  const baseCost = getCost(initialState);
  let uphillSum = 0;
  let uphillCount = 0;
  for (let i = 0; i < 100; i++) {
    const delta = getCost(generateNeighbor(initialState)) - baseCost;
    if (delta > 0) {
      uphillSum += delta;
      uphillCount++;
    }
  }
  const avgUphill = uphillCount ? uphillSum / uphillCount : 1;
  const initialTemperature = avgUphill / Math.log(1 / 0.8) || 1;

  return new SimulatedAnnealer({
    getCost,
    generateNeighbor,
    initialState,
    initialTemperature,
    maxIterations: 8_000 * filteredPeople.length,
  });
};
