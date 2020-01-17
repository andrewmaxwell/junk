import {getData} from './data.js';
import {SimulatedAnnealingSolver} from '../tsp-simulated-annealing/solver.js';
import {Stats} from './stats.js';

const OVERLAP_COST = 100;
const FREQUENCY_COST = 10;

const randEl = arr => arr[Math.floor(Math.random() * arr.length)];
const randSolution = slots => slots.map(s => randEl(s.people));
const uniq = (arr, seen = {}) => arr.filter(v => !seen[v] && (seen[v] = true));

const overlapCost = (s, slots, debug) => {
  const seen = {};
  let overlapCount = 0;
  for (let i = 0; i < slots.length; i++) {
    const key = slots[i].date + slots[i].time + s[i].name;
    if (seen[key]) {
      overlapCount++;
      if (debug) slots[i].debug.push(`Assigned more than once!`);
    }
    seen[key] = true;
  }
  return overlapCount * OVERLAP_COST;
};

const frequencyCost = (s, slots, debug) => {
  const sched = [];
  let cost = 0;
  for (let i = 0; i < slots.length; i++) {
    const {week} = slots[i];
    const {index, freq} = s[i];
    if (sched[index]) {
      const diff = freq - week + sched[index];
      if (diff > 0) {
        cost += diff;
        if (debug)
          slots[i].debug.push(
            `${diff} week${
              diff > 1 ? 's' : ''
            } too soon (prefers ${freq} weeks).`
          );
      }
    }
    sched[index] = week;
  }
  return cost * FREQUENCY_COST;
};

const stats = new Stats(window.canvas, [
  {key: 'temperature', color: 'red', formatter: v => v.toFixed(2)},
  {key: 'currentCost', color: 'gray'}
]);

(async () => {
  const {slots} = await getData();

  const getCost = (s, debug) =>
    overlapCost(s, slots, debug) + frequencyCost(s, slots, debug);

  const solver = new SimulatedAnnealingSolver({
    initialTemperature: 1e5,
    coolingFactor: 0.9999,
    getCost,
    generateNeighbor: s => {
      const next = s.slice();
      const index = Math.floor(Math.random() * s.length);
      next[index] = randEl(slots[index].people);
      return next;
    }
  });
  solver.init(randSolution(slots));

  const loop = () => {
    for (let i = 0; i < 1e3; i++) solver.iterate();

    stats.update(solver);
    stats.render();

    if (solver.temperature > 1) requestAnimationFrame(loop);
    else {
      console.log(solver.bestState);
      getCost(solver.bestState, true);
      window.output.innerHTML = [
        ['Date', 'Time', 'Class/Role', 'Assigned To', 'Comments'],
        ...slots.map((s, i) => [
          s.date,
          s.time,
          s.role,
          solver.bestState[i].name,
          uniq(s.debug).join(' ')
        ])
      ]
        .map(
          (r, i) =>
            `<tr>${r
              .map(v => (i ? `<td>${v}</td>` : `<th>${v}</th>`))
              .join('')}</tr>`
        )
        .join('\n');
    }
  };
  loop();
})();
