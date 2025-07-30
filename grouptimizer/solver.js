import SimulatedAnnealer from './SimulatedAnnealer.js';
import {rand, randWhere} from './utils.js';

/**
 * @typedef {{
 *  name: string,
 *  sponsor: boolean,
 *  gender: 'm' | 'f',
 *  contrib: number,
 *  weights: Record<string, number>,
 *  dates: Date[],
 *  birthday: Date,
 *  score: number,
 *  absent: boolean,
 *  grade: number,
 * }} Person
 * */

/** @type {(numGroups: number, people: Person[]) => Person[][]} */
const makeInitialState = (numGroups, people) => {
  /** @type {Person[][]} */
  const groups = Array.from({length: numGroups}, () => []);

  [
    ...people.filter((p) => p.sponsor),
    ...people.filter((p) => !p.sponsor),
  ].forEach((person, i) => {
    groups[i % numGroups].push(person);
  });

  return groups;
};

/** @param {Person[]} group */
export const getGroupStats = (group) => {
  let female = 0;
  let contrib = 0;
  let students = 0;
  let weightSum = 0;

  for (let i = 0; i < group.length; i++) {
    const p = group[i];
    if (!p.sponsor) {
      students++;
      female += p.gender === 'f' ? 1 : 0;
      contrib += p.contrib;
    }
    for (let k = 0; k < i; k++) {
      weightSum += p.weights[group[k].name] ?? 0;
    }
  }

  return {
    genderRatio: students ? female / students : 0,
    contribAverage: students ? contrib / students : 0,
    weightSum,
  };
};

/** @param {Person[]} people */
const makeCostFn = (people, wPair = 4, wContrib = 2, wGender = 1) => {
  const students = people.filter((p) => !p.sponsor);
  const avgContrib =
    students.reduce((s, p) => s + p.contrib, 0) / students.length;
  const globalFemaleRatio =
    students.filter((s) => s.gender === 'f').length / students.length;

  /** @param {Person[][]} groups */
  return (groups) => {
    let pairBenefit = 0;
    let contribSqErr = 0;
    let genderSqErr = 0;

    for (const g of groups) {
      const {contribAverage, genderRatio, weightSum} = getGroupStats(g);
      pairBenefit += weightSum;
      contribSqErr += (contribAverage - avgContrib) ** 2;
      genderSqErr += (genderRatio - globalFemaleRatio) ** 2;
    }

    const contribSpread = Math.sqrt(contribSqErr / groups.length);
    const genderSpread = Math.sqrt(genderSqErr / groups.length);
    return (
      wContrib * contribSpread + wGender * genderSpread - wPair * pairBenefit
    );
  };
};

/**
 * @param {number} numGroups
 * @param {Person[]} filteredPeople */
export const makeSolver = (numGroups, filteredPeople) =>
  new SimulatedAnnealer({
    getCost: makeCostFn(filteredPeople),
    /** @param {Person[][]} grouping */
    generateNeighbor: (grouping) => {
      // pick two random groups and swap a random person from each
      const newGrouping = grouping.slice(0);

      const groupIndex1 = rand(newGrouping.length);
      const groupIndex2 = randWhere(
        newGrouping.length,
        (r) => r === groupIndex1,
      );

      const group1 = (newGrouping[groupIndex1] =
        newGrouping[groupIndex1].slice(0));
      const group2 = (newGrouping[groupIndex2] =
        newGrouping[groupIndex2].slice(0));

      const personIndex1 = rand(group1.length);
      const personIndex2 = randWhere(
        group2.length,
        (r) => group1[personIndex1].sponsor !== group2[r].sponsor,
      );

      const temp = group1[personIndex1];
      group1[personIndex1] = group2[personIndex2];
      group2[personIndex2] = temp;

      return newGrouping;
    },
    initialState: makeInitialState(numGroups, filteredPeople),
    initialTemperature: 10,
    maxIterations: 10_000 * filteredPeople.length,
  });
