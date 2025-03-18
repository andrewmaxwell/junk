import StatGraph from './statGraph.js';
import {makeReport} from './makeReport.js';
import {makeSolver} from './solver.js';
import {getData} from './getData.js';
import {makeAttendanceTable} from './makeAttendanceTable.js';

const stats = new StatGraph(document.querySelector('#statCanvas'));
const annealingGraph = stats.addGraph({color: 'red'});
const temperatureGraph = stats.addGraph({color: 'green', forceMin: 0});
const solver = makeSolver();

let people;

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

    document.querySelector('#output').innerHTML = groups
      .map((g) => `${g.list}<br>${g.stats}`)
      .join('<br><br>');
    console.log(solver.minCost);
  } else {
    requestAnimationFrame(loop);
    annealingGraph(solver.currentCost);
    temperatureGraph(solver.temperature);
    stats.draw();
  }
};

const resize = () => {
  stats.resize(window.innerWidth, 300);
};
window.addEventListener('resize', resize);
resize();

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

document.querySelectorAll('.go').forEach((button) => {
  button.addEventListener('click', async function () {
    const numGroups =
      parseFloat(document.querySelector('#numGroups').value) || 4;

    const gender = button.dataset?.gender;

    const filteredPeople = people
      .filter((p) => !p.absent && (!gender || p.gender === gender))
      .sort((a, b) => b.contrib - a.contrib);

    solver.init(
      makeInitialState(numGroups, filteredPeople),
      10,
      10_000 * filteredPeople.length,
    );
    stats.reset();

    console.log('>>>', solver.minCost);

    loop();
  });
});

document.querySelector('#send').addEventListener('click', () => {
  const subject = encodeURIComponent(`Attendance ${new Date().toDateString()}`);
  const body = encodeURIComponent(makeReport(people));
  open(`mailto:jgovier8@gmail.com?subject=${subject}&body=${body}`);
});

const numPresentSponsors = (people) =>
  people.filter((p) => !p.absent && p.sponsor).length;

const numPresentStudents = (people) =>
  people.filter((p) => !p.absent && !p.sponsor).length;

const init = async () => {
  people = await getData();

  document.querySelector('#numGroups').value = Math.min(
    numPresentSponsors(people),
    Math.floor(numPresentStudents(people) / 4),
  );
  document.querySelector('#output').innerText = makeReport(people);
  document.querySelector('#attendance').innerHTML = makeAttendanceTable(people);
};

init();
