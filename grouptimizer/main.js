import StatGraph from './statGraph.js';
import getPeople from './getPeople.js';
import {makeReport} from './makeReport.js';
import {updateMyJSON} from './myJSON.js';
import {makeSolver} from './solver.js';

const stats = new StatGraph(document.getElementById('statCanvas'));
const annealingGraph = stats.addGraph({color: 'red'});
const temperatureGraph = stats.addGraph({color: 'green', forceMin: 0});
const solver = makeSolver();

let people, attendanceHistory;

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
      10_000 * filteredPeople.length
    );
    stats.reset();

    console.log('>>>', solver.minCost);

    loop();
  });
});

document.querySelector('#send').addEventListener('click', async () => {
  const emailAddress = 'jgovier8@gmail.com';
  const subject = encodeURIComponent(`Attendance ${new Date().toDateString()}`);
  const body = encodeURIComponent(makeReport(people, attendanceHistory));

  open(`mailto:${emailAddress}?subject=${subject}&body=${body}`);
});

const init = async () => {
  people = await getPeople();
  attendanceHistory = await updateMyJSON(people);
  document.querySelector('#output').innerText = makeReport(
    people,
    attendanceHistory
  );
};
init();
