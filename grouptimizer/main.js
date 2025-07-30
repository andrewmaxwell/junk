import StatGraph from './statGraph.js';
import {makeReport} from './makeReport.js';
import {getGroupStats, makeSolver} from './solver.js';
import {getData} from './getData.js';
import {makeAttendanceTable} from './makeAttendanceTable.js';

/** @type {HTMLDivElement | null} */
const outputDiv = document.querySelector('#output');
/** @type {HTMLInputElement | null} */
const numGroupsInput = document.querySelector('#numGroups');
const sendButton = document.querySelector('#send');
const attendanceTable = document.querySelector('#attendance');

const stats = new StatGraph(document.querySelector('#statCanvas'));
const annealingGraph = stats.addGraph({color: 'red'});
const temperatureGraph = stats.addGraph({color: 'green', forceMin: 0});

/** @import SimulatedAnnealer from './SimulatedAnnealer.js' */
/** @import {Person} from './solver.js' */
/** @type {SimulatedAnnealer<Person[][]>} */
let solver;

/** @type {Person[]} */
let people;

const loop = () => {
  for (let i = 0; !solver.isDone && i < 1000; i++) {
    solver.iterate();
  }

  if (solver.isDone && solver.bestState !== undefined) {
    const groups = solver.bestState.map((g) => ({
      list: g
        .sort(
          (a, b) =>
            Number(a.sponsor) - Number(b.sponsor) || a.contrib - b.contrib,
        )
        .map((p) => p.name)
        .join(', '),
      stats: Object.entries(getGroupStats(g))
        .map(([k, v]) => k + ': ' + Math.round(v * 100) / 100)
        .join(', '),
    }));

    console.log(solver.minCost);
    if (outputDiv) {
      outputDiv.innerHTML = groups
        .map((g) => `${g.list}<br>${g.stats}`)
        .join('<br><br>');
    }
  } else {
    requestAnimationFrame(loop);
    annealingGraph(solver.currentCost);
    if (solver.temperature !== undefined) {
      temperatureGraph(solver.temperature);
    }
    stats.draw();
  }
};

const resize = () => {
  stats.resize(window.innerWidth, 300);
};
window.addEventListener('resize', resize);
resize();

document.querySelectorAll('.go').forEach((button) => {
  button.addEventListener('click', async function () {
    if (!numGroupsInput) return;
    const numGroups = Number(numGroupsInput.value) || 4;
    const gender = button.getAttribute('data-gender');
    const filteredPeople = people
      .filter((p) => !p.absent && (!gender || p.gender === gender))
      .sort((a, b) => b.contrib - a.contrib);

    solver = makeSolver(numGroups, filteredPeople);
    stats.reset();

    loop();
  });
});

if (sendButton) {
  sendButton.addEventListener('click', () => {
    const subject = encodeURIComponent(
      `Attendance ${new Date().toDateString()}`,
    );
    const body = encodeURIComponent(makeReport(people));
    open(`mailto:jgovier8@gmail.com?subject=${subject}&body=${body}`);
  });
}

/** @param {Person[]} people */
const numPresentSponsors = (people) =>
  people.filter((p) => !p.absent && p.sponsor).length;

/** @param {Person[]} people */
const numPresentStudents = (people) =>
  people.filter((p) => !p.absent && !p.sponsor).length;

const init = async () => {
  people = await getData();

  if (numGroupsInput) {
    numGroupsInput.value = String(
      Math.min(
        numPresentSponsors(people),
        Math.floor(numPresentStudents(people) / 4),
      ),
    );
  }
  if (outputDiv) outputDiv.innerText = makeReport(people);
  if (attendanceTable) attendanceTable.innerHTML = makeAttendanceTable(people);
};

init();
