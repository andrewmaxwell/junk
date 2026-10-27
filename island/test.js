// Checks the landscape model against things that have to be true. Run with `node island/test.js`.
import {makeSim, defaults} from './sim.js';

let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures++;
};

const N = 128;
const cellSize = 80;
const sim = makeSim({N, cellSize, seed: 7});
const num = N * N;

// Every point drains somewhere lower or level, and following receivers always ends at the edge
// or in the sea, never in a loop.
sim.route(defaults.seaLevel);
let loops = 0;
let uphill = 0;
for (let i = 0; i < num; i++) {
  let j = i;
  for (let steps = 0; sim.receiver[j] !== j; steps++) {
    if (sim.water[sim.receiver[j]] > sim.water[j] + 1e-9) uphill++;
    j = sim.receiver[j];
    if (steps > num) {
      loops++;
      break;
    }
  }
}
check(loops === 0, `no drainage loops (${loops})`);
check(uphill === 0, `nothing drains uphill (${uphill})`);

// All the island's area drains somewhere: the area reaching the outlets is the whole grid.
let outletArea = 0;
for (let i = 0; i < num; i++)
  if (sim.receiver[i] === i) outletArea += sim.area[i];
check(
  Math.abs(outletArea - num * cellSize * cellSize) < 1,
  'drainage area adds up to the whole grid',
);

// Lakes are flat and sit no higher than the land around them.
let badLakes = 0;
for (let i = 0; i < num; i++) {
  if (sim.wet[i] === 1 && sim.water[i] <= sim.water[sim.receiver[i]] - 1e-9)
    badLakes++;
}
check(badLakes === 0, 'lakes spill downhill');

// Run toward steady state with no soil creep, where the stream power law gives an exact answer:
// erosion balances uplift, so S = U / (K (P A)^m) at every river point.
const params = {...defaults, D: 0, marineD: 0};
for (let t = 0; t < 400; t++) sim.step(5000, params);
sim.route(params.seaLevel);

// At steady state height stops changing.
const before = sim.height.slice();
sim.step(5000, params);
let maxRate = 0;
let maxUplift = params.upliftRate / 1000;
for (let i = 0; i < num; i++) {
  if (sim.wet[i] || sim.receiver[i] === i) continue;
  maxRate = Math.max(maxRate, Math.abs(sim.height[i] - before[i]) / 5000);
}
check(
  maxRate < maxUplift * 0.05,
  `steady state: land changes under 5% of uplift (${((maxRate / maxUplift) * 100).toFixed(2)}%)`,
);

// Erosion balancing uplift is local, so each dry point's slope must match its own uplift.
const ys = [];
sim.route(params.seaLevel);
for (let i = 0; i < num; i++) {
  const r = sim.receiver[i];
  if (r === i || sim.wet[i] || sim.wet[r]) continue;
  const slope =
    (sim.height[i] - sim.height[r]) /
    (Math.hypot((r % N) - (i % N), ((r / N) | 0) - ((i / N) | 0)) * cellSize);
  if (slope <= 0) continue;
  const predicted =
    (sim.uplift[i] * params.upliftRate) /
    1000 /
    (params.K * Math.pow(params.rain * sim.area[i], params.m));
  ys.push(Math.log(slope / predicted));
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const errors = ys.map(Math.abs).sort((a, b) => a - b);
const median = errors[errors.length >> 1];
check(
  ys.length > 100 && median < 0.05,
  `slope matches U/(K(PA)^m) at ${ys.length} points (median error ${(median * 100).toFixed(2)}%, mean log ratio ${mean(ys).toFixed(4)})`,
);

process.exit(failures ? 1 : 0);
