import {PriorityQueue} from '../misc/PriorityQueue.js';
import {makeSimulatedAnnealer} from '../sundayScheduler/simulatedAnnealer.js';

/**
 *
 * @typedef {{
 *   from: string,
 *   to: string,
 *   truck?: string,
 *   startTime?: number,
 *   endTime?: number,
 *   isEmpty?: boolean
 * }} Load
 *
 * @typedef {Record<string, Record<string, number>>} TravelTimes
 *
 * @typedef {{
 *   loads:  Load[],
 *   travelTimes: TravelTimes,
 *   trucks: { id: string, startLocation: string }[],
 * }} SolverInput
 *
 * @type {(input: SolverInput) => Load[]}
 */
function solve({loads, travelTimes, trucks}) {
  const dist = (a, b) => (a === b ? 0 : (travelTimes[a]?.[b] ?? Infinity));

  const pq = new PriorityQueue((a, b) => a.key < b.key); // min‑heap

  const entries = trucks.map(({id, startLocation}) => {
    const entry = {id, loc: startLocation, free: 0, key: 0};
    pq.push(entry);
    return entry;
  });

  for (const load of loads) {
    for (const e of entries) {
      e.key = e.free + dist(e.loc, load.from);
      pq.updatePosition(e); // O(log T)
    }

    const truck = pq.pop(); // object reference from entries[]
    const start = truck.free + dist(truck.loc, load.from);
    const end = start + dist(load.from, load.to);

    Object.assign(load, {truck: truck.id, startTime: start, endTime: end});
    truck.loc = load.to;
    truck.free = end;
    pq.push(truck);
  }

  return loads;
}

/** @type {(input: SolverInput) => number} */
const getCost = (input) =>
  solve(input).reduce((res, load) => Math.max(res, load.endTime ?? 0), 0);

/** @type {(input: SolverInput) => SolverInput} */
const generateNeighbor = (input) => {
  const index1 = Math.floor(Math.random() * input.loads.length);
  const index2 = Math.floor(Math.random() * input.loads.length);
  const newLoads = [...input.loads];
  [newLoads[index1], newLoads[index2]] = [newLoads[index2], newLoads[index1]];
  return {...input, loads: newLoads};
};

const initialTemperature = 10_000;
const maxIterations = 10_000;
const alpha = 1 - 1 / 1000;

/** @type {(input: SolverInput) => SolverInput} */
function solveWithAnnealing(input) {
  const annealer = makeSimulatedAnnealer(
    getCost,
    generateNeighbor,
    input,
    initialTemperature,
    maxIterations,
    alpha,
  );
  for (let i = 0; i < maxIterations; i++) {
    annealer.iterate();
    console.log(annealer.getResults().currentCost);
  }
  const results = annealer.getResults();
  console.log('results', results);
  return results.bestState;
}

//////////////////

/** @type {<T>(arr: T[]) => T} */
const randEl = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** @type {(config: {numLocations: number, numLoads: number, numTrucks: number}) => SolverInput} */
const generateInput = ({numLocations, numLoads, numTrucks}) => {
  const locations = Array.from({length: numLocations}, (_, i) => ({
    id: `${i + 1}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
  }));

  /** @type {Load[]} */
  const loads = [];
  for (let i = 0; i < numLoads; i++) {
    loads[i] = {
      from: randEl(locations)?.id,
      to: randEl(locations)?.id,
    };
    if (loads[i].from === loads[i].to) i--;
  }

  /** @type {Record<string, Record<string, number>>} */
  const travelTimes = {};
  locations.forEach((a) => {
    locations.forEach((b) => {
      (travelTimes[a.id] ??= {})[b.id] = (travelTimes[b.id] ??= {})[a.id] =
        Math.max(2, Math.round(Math.hypot(a.x - b.x, a.y - b.y)));
    });
  });

  const trucks = Array.from({length: numTrucks}, (_, i) => ({
    id: `truck${String(i + 1).padStart(2, '0')}`,
    startLocation: randEl(locations)?.id,
  }));

  return {loads, travelTimes, trucks};
};

const rowHeight = 16;
const xScale = 20;

let result = '';

/** @type {(load: Load, y: number) => void} */
const addDiv = ({from, to, startTime, endTime, isEmpty}, y) => {
  if (startTime === undefined || endTime === undefined) return;
  const x = startTime * xScale;
  const w = (endTime - startTime) * xScale;
  result += `
  <div 
    class="load ${isEmpty ? 'isEmpty' : ''}" 
    style="top:${y}px; left:${x}px; width: ${w}; height: ${rowHeight}"
  >
    ${from} -> ${to}
  </div>`;
};

const input = generateInput({numLocations: 50, numLoads: 200, numTrucks: 50});
const solution = solveWithAnnealing(input);

const truckStartingLocations = Object.fromEntries(
  input.trucks.map((t) => [t.id, t.startLocation]),
);

/** @type {Record<string, Load[]>} */
const groupedByTruck = {};
for (const load of solution.loads) {
  if (!load.truck) {
    throw new Error(`Load does not have a truck: ${JSON.stringify(load)}`);
  }
  (groupedByTruck[load.truck] ??= []).push(load);
}

Object.entries(groupedByTruck).forEach(([truck, loads], i) => {
  const y = i * (rowHeight + 1);
  loads.forEach((load, i, arr) => {
    const prevLoc = arr[i - 1]?.to ?? truckStartingLocations[truck];
    if (load.from !== prevLoc) {
      addDiv(
        {
          from: prevLoc,
          to: load.from,
          startTime:
            (load.startTime ?? 0) - input.travelTimes[prevLoc][load.from],
          endTime: load.startTime,
          truck: load.truck,
          isEmpty: true,
        },
        y,
      );
    }

    addDiv(load, y);
  });
});

const resultDiv = document.querySelector('#result');
if (resultDiv) resultDiv.innerHTML = result;
console.log(input);

console.log('cost', getCost(solution));
