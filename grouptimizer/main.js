import SimulatedAnnealingSolver from './solver.js';
import {rand, standardDeviation, randWhere} from './utils.js';
import StatGraph from './statGraph.js';
import getPeople from './getPeople.js';
import {makeReport} from './makeReport.js';
import {updateMyJSON} from './myJSON.js';

const stats = new StatGraph(document.getElementById('statCanvas'));
const annealingGraph = stats.addGraph({color: 'red'});
const temperatureGraph = stats.addGraph({color: 'green', forceMin: 0});

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

const solver = (window.top.solver = new SimulatedAnnealingSolver({
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
    const groupIndex2 = randWhere(newGrouping.length, (r) => r === groupIndex1);

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
}));

const loop = () => {
  for (let i = 0; !solver.isDone && i < 1000; i++) {
    solver.iterate();
  }

  if (solver.isDone) {
    const groups = solver.bestState.map((g) => ({
      list: g
        .sort((a, b) => a.sponsor - b.sponsor || a.contrib - b.contrib)
        .map((p) => p.name)
        .join(', '),
      stats: Object.entries(g.stats)
        .map(([k, v]) => k + ': ' + Math.round(v * 100) / 100)
        .join(', '),
    }));

    $('#output').html(
      groups.map((g) => `${g.list}<br>${g.stats}`).join('<br><br>')
    );
    console.log(solver.minCost);
  } else {
    requestAnimationFrame(loop);
    annealingGraph(solver.currentCost);
    temperatureGraph(solver.temperature);
    stats.draw();
  }
};

const {$} = window;
$(window)
  .on('resize', () => {
    stats.resize(window.innerWidth, 300);
  })
  .trigger('resize');

const makeInitialState = (numGroups, people) => {
  const res = [];
  for (let i = 0; i < numGroups; i++) res[i] = [];

  people
    .filter((p) => p.sponsor)
    .forEach((p, i) => {
      res[i % numGroups].push(p);
    });

  people
    .filter((p) => !p.sponsor)
    .forEach((p, i) => {
      res[i % numGroups].push(p);
    });
  return res;
};

$('.go').on('click', async function () {
  const numGroups = parseFloat($('#numGroups').val()) || 4;
  const gender = $(this).data('gender');

  $(this).prop('disabled', true);
  const people = (await getPeople())
    .sort((a, b) => b.contrib - a.contrib)
    .filter((p) => !p.absent && (!gender || p.gender === gender));

  console.log(people);
  $(this).prop('disabled', false);

  solver.init(makeInitialState(numGroups, people), 10, 10_000 * people.length);
  stats.reset();

  console.log('>>>', solver.minCost);

  loop();
});

$('#send').on('click', async () => {
  const people = await getPeople();
  const history = await updateMyJSON(people);

  const emailAddress = 'jgovier8@gmail.com';
  const subject = encodeURIComponent(`Attendance ${new Date().toDateString()}`);
  const body = encodeURIComponent(makeReport(people, history));

  open(`mailto:${emailAddress}?subject=${subject}&body=${body}`);
});
