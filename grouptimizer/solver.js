import SimulatedAnnealer from './SimulatedAnnealer.js';
import {rand, standardDeviation, randWhere} from './utils.js';

const getGroupStats = (group) => {
  let genderTotal = 0;
  let contribTotal = 0;
  let numStudents = 0;
  let weightSum = 0;

  // for each person
  for (let j = 0; j < group.length; j++) {
    const {sponsor, gender, contrib, weights} = group[j];

    if (!sponsor) {
      genderTotal += gender === 'f';
      contribTotal += contrib;
      numStudents++;
    }

    // for each person after the current person in the group, so we get each pair
    for (let k = 0; k < j; k++) {
      weightSum += weights[group[k].name] || 0;
    }
  }

  return {
    genderRatio: genderTotal / numStudents,
    contribAverage: contribTotal / numStudents,
    weightSum,
  };
};

export const makeSolver = () =>
  new SimulatedAnnealer({
    getCost: (grouping) => {
      const genderRatios = []; // we want the genders to be balanced
      const contribAverages = []; // we want each group to have a similar average contrib
      let weightCost = 0;

      // for each group
      for (let i = 0; i < grouping.length; i++) {
        const g = grouping[i];
        const stats = getGroupStats(g);
        genderRatios[i] = stats.genderRatio;
        contribAverages[i] = stats.contribAverage;
        weightCost += stats.weightSum;
        g.stats = stats;
      }

      const genderSD = standardDeviation(genderRatios);
      const avContribSD = standardDeviation(contribAverages);
      return genderSD + avContribSD - weightCost + 2;
    },
    generateNeighbor: (grouping) => {
      // pick two random groups and swap a random person from each
      const newGrouping = grouping.slice(0);

      const groupIndex1 = rand(newGrouping.length);
      const groupIndex2 = randWhere(
        newGrouping.length,
        (r) => r === groupIndex1
      );

      const group1 = (newGrouping[groupIndex1] =
        newGrouping[groupIndex1].slice(0));
      const group2 = (newGrouping[groupIndex2] =
        newGrouping[groupIndex2].slice(0));

      const personIndex1 = rand(group1.length);
      const personIndex2 = randWhere(
        group2.length,
        (r) => group1[personIndex1].sponsor !== group2[r].sponsor
      );

      const temp = group1[personIndex1];
      group1[personIndex1] = group2[personIndex2];
      group2[personIndex2] = temp;

      return newGrouping;
    },
  });
