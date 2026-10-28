// Checks the landscape model against things that have to be true. Run with `node island/test.js`.
import {
  makeSim,
  defaults,
  evaporation,
  potentialEvaporation,
  plantCover,
  iceAgeSeaLevel,
} from './sim.js';

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
sim.route(defaults);
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

// Budyko's curve at its known points: where rain is ten times what the air could take,
// evaporation nearly reaches that potential; where it's a tenth, nearly all the rain
// evaporates; where they're equal, Budyko's formula gives 0.69.
{
  const p = potentialEvaporation(20);
  const close = (a, b) => Math.abs(a - b) < 0.01;
  check(
    evaporation(p * 10, p) / p > 0.95 &&
      evaporation(p / 10, p) / (p / 10) > 0.99 &&
      close(evaporation(p, p) / p, 0.69),
    `Budyko evaporation: wet ${(evaporation(p * 10, p) / p).toFixed(3)} of potential, dry ${(evaporation(p / 10, p) / (p / 10)).toFixed(3)} of rain, balanced ${(evaporation(p, p) / p).toFixed(3)}`,
  );
}

// Langbein and Schumm (1958): sediment yield peaks in semi-arid climates, near 300 mm of rain a
// year, where there's enough runoff to move soil but too little for plants to hold it. Here the
// erosion rate per unit slope goes as erodibility × √runoff.
{
  const t = 24;
  const rates = [];
  for (let rain = 0.05; rain <= 3; rain += 0.05) {
    const cover = plantCover(rain, t);
    const lost = evaporation(rain, potentialEvaporation(t));
    const runoff = Math.max(rain - lost, rain * 0.3 * (1 - cover));
    rates.push([rain, Math.exp(-2 * cover) * Math.sqrt(runoff)]);
  }
  const [peak] = rates.reduce((a, b) => (b[1] > a[1] ? b : a));
  const at = (r) => rates.find(([x]) => Math.abs(x - r) < 0.01)[1];
  check(
    peak > 0.2 && peak < 0.5 && at(1.2) < at(peak) / 2,
    `erosion peaks in semi-arid climates (at ${peak.toFixed(2)} m/yr of rain, ${(at(peak) / at(1.2)).toFixed(1)}× the rate at 1.2 m/yr)`,
  );
}

// With no uplift or creep, every m³ rivers cut away ends up in a lake, in the sea or off the
// edge of the grid.
{
  const fresh = makeSim({N, cellSize, seed: 7});
  const still = {...defaults, upliftRate: 0, D: 0, marineD: 0};
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const start = sum(fresh.height);
  let eroded = 0;
  for (let t = 0; t < 50; t++) {
    const h = fresh.height.slice();
    fresh.step(5000, still);
    for (let i = 0; i < num; i++) eroded += Math.max(0, h[i] - fresh.height[i]);
  }
  const change =
    (sum(fresh.height) - start) * cellSize * cellSize +
    fresh.lostSediment -
    fresh.reefVolume;
  check(
    Math.abs(change) < 1e-6 * eroded * cellSize * cellSize,
    `sediment is conserved (${change.toExponential(2)} m³ unaccounted of ${(eroded * cellSize * cellSize).toExponential(2)} m³ moved)`,
  );
}

// The side of the island facing the wind gets more rain than the side away from it.
{
  sim.route(defaults);
  const angle = (defaults.wind * Math.PI) / 180;
  const [wx, wz] = [-Math.sin(angle), Math.cos(angle)];
  let cx = 0;
  let land = 0;
  for (let i = 0; i < num; i++) {
    if (sim.height[i] <= defaults.seaLevel) continue;
    cx += (i % N) * wx + ((i / N) | 0) * wz;
    land++;
  }
  cx /= land;
  const sides = [
    [0, 0],
    [0, 0],
  ];
  for (let i = 0; i < num; i++) {
    if (sim.height[i] <= defaults.seaLevel) continue;
    const lee = (i % N) * wx + ((i / N) | 0) * wz > cx ? 1 : 0;
    sides[lee][0] += sim.rain[i];
    sides[lee][1]++;
  }
  const [windward, leeward] = sides.map(([r, n]) => r / n);
  check(
    windward > leeward * 1.3,
    `windward side is wetter (${windward.toFixed(2)} vs ${leeward.toFixed(2)} m/yr)`,
  );
}

// Waves build up over open water downwind, so they cut the windward coast back further than
// the lee. In a cold sea with no reefs and no uplift, compare how much more land each side loses
// with waves than without (creep alone slumps some low coast below the sea).
{
  const angle = (defaults.wind * Math.PI) / 180;
  const [wx, wz] = [-Math.sin(angle), Math.cos(angle)];
  const lee = (i) =>
    ((i % N) - N / 2) * wx + (((i / N) | 0) - N / 2) * wz > 0 ? 1 : 0;
  const landLost = (waveErosion) => {
    const s = makeSim({N, cellSize, seed: 7});
    const p = {...defaults, temperature: 5, upliftRate: 0, waveErosion};
    const before = s.height.slice();
    for (let t = 0; t < 100; t++) s.step(2000, p);
    const lost = [0, 0]; // windward, lee
    for (let i = 0; i < num; i++)
      if (before[i] > 0 && s.height[i] <= 0) lost[lee(i)]++;
    return lost;
  };
  const waves = landLost(defaults.waveErosion);
  const none = landLost(0);
  const [windward, leeward] = [waves[0] - none[0], waves[1] - none[1]];
  check(
    windward > leeward * 1.2,
    `waves cut the windward coast back further (${windward} vs ${leeward} more points lost in 200,000 years)`,
  );
}

// The ice ages' sea level stays between today's and 125 m down, averages about half way, and
// comes back up fast at the end of each 100,000-year cycle.
{
  const levels = Array.from({length: 1000}, (_, k) => iceAgeSeaLevel(k * 100));
  const mean = levels.reduce((a, b) => a + b) / levels.length;
  check(
    Math.max(...levels) <= 0 &&
      Math.min(...levels) >= -125 &&
      mean < -40 &&
      mean > -80 &&
      iceAgeSeaLevel(100e3 - 1) > -1 &&
      iceAgeSeaLevel(88e3) < -110,
    `ice-age sea level: mean ${mean.toFixed(0)} m, lowest ${Math.min(...levels).toFixed(0)} m`,
  );
}

// Landslides keep ground from standing steeper than it can hold: after rivers and waves have
// cut into it, almost nothing is left steeper than the critical slope.
{
  const s = makeSim({N, cellSize, seed: 7});
  for (let t = 0; t < 100; t++) s.step(2000, defaults);
  let steep = 0;
  let pairs = 0;
  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const i = z * N + x;
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        const drop = Math.abs(s.height[i] - s.height[i + dz * N + dx]);
        pairs++;
        if (drop > defaults.criticalSlope * Math.hypot(dx, dz) * cellSize * 1.1)
          steep++;
      }
    }
  }
  check(
    steep < pairs / 1000,
    `landslides: ${steep} of ${pairs} neighbor pairs are more than 10% steeper than the critical slope`,
  );
}

// Darwin (1842): as an island sinks, reefs on its flanks keep growing up to the sea and are
// left as a ring around a lagoon, an atoll. If it sinks faster than reefs can grow, they
// drown and only a flat-topped seamount is left (a guyot).
{
  const sink = (rate, steps, reefGrowth = defaults.reefGrowth) => {
    const s = makeSim({N, cellSize, seed: 7});
    let peak = 0;
    for (let i = 0; i < num; i++) if (s.height[i] > s.height[peak]) peak = i;
    const p = {...defaults, upliftRate: -rate, reefGrowth};
    for (let t = 0; t < steps; t++) s.step(2000, p);
    const top = s.height.reduce((a, b) => Math.max(a, b), -Infinity);
    return {top, lagoon: s.height[peak]};
  };
  const atoll = sink(0.5, 300);
  const bare = sink(0.5, 300, 0);
  check(
    atoll.top > -2 && atoll.top <= 3 && atoll.lagoon < -10 && bare.top < -20,
    `sinking 0.5 mm/yr for 600,000 years makes an atoll: its highest point is ${atoll.top.toFixed(1)} m (storm-built islets), with ${(-atoll.lagoon).toFixed(0)} m of lagoon over the old peak; without reefs the top is ${(-bare.top).toFixed(0)} m down`,
  );
  const guyot = sink(defaults.reefGrowth * 1000 * 1.5, 50);
  check(
    guyot.top < -50,
    `sinking 1.5× faster than reefs grow drowns them (after 100,000 years the shallowest point is ${(-guyot.top).toFixed(0)} m deep)`,
  );
}

// Run toward steady state with no soil creep, waves, landslides or layered rock, where the stream power law
// with deposition gives an exact answer (Yuan et al. 2019): everything uplifted upstream
// passes through, so rivers drop G Qs / A = G Ū (Ū the mean uplift upstream), and cutting
// balances both: S = (U + G Ū) / (K Q^m) at every river point.
const params = {
  ...defaults,
  D: 0,
  marineD: 0,
  waveErosion: 0,
  layering: 0,
  criticalSlope: 0,
};
for (let t = 0; t < 2000; t++) sim.step(5000, params);
sim.route(params);

// At steady state height stops changing. A point or two can flicker when its steepest neighbor
// is nearly tied, so allow one in a thousand. Points with sediment over the rock are left out:
// rivers drop sediment on them and cut it away again, switching between the sediment's
// erodibility and the rock's.
const before = sim.height.slice();
const soilBefore = sim.soil.slice();
sim.step(5000, params);
const maxUplift = params.upliftRate / 1000;
let moving = 0;
let dry = 0;
for (let i = 0; i < num; i++) {
  if (sim.wet[i] || sim.receiver[i] === i) continue;
  if (soilBefore[i] > 0.5 || sim.soil[i] > 0.5) continue;
  dry++;
  if (Math.abs(sim.height[i] - before[i]) / 5000 > maxUplift * 0.05) moving++;
}
check(
  moving <= dry / 1000,
  `steady state: ${moving} of ${dry} land points change by more than 5% of uplift`,
);

// Each dry point's slope must match its own uplift and what arrives from upstream.
const ys = [];
sim.route(params);
const upliftUpstream = new Float64Array(num); // m³/yr uplifted on the land draining here
for (let k = num - 1; k >= 0; k--) {
  const i = sim.stack[k];
  upliftUpstream[i] +=
    (sim.uplift[i] * params.upliftRate * cellSize * cellSize) / 1000;
  if (sim.receiver[i] !== i)
    upliftUpstream[sim.receiver[i]] += upliftUpstream[i];
}
for (let i = 0; i < num; i++) {
  const r = sim.receiver[i];
  if (r === i || sim.wet[i] || sim.wet[r] || sim.uplift[i] === 0) continue;
  const slope =
    (sim.height[i] - sim.height[r]) /
    (Math.hypot((r % N) - (i % N), ((r / N) | 0) - ((i / N) | 0)) * cellSize);
  if (slope <= 0) continue;
  const predicted =
    ((sim.uplift[i] * params.upliftRate) / 1000 +
      (params.G * upliftUpstream[i]) / sim.area[i]) /
    (sim.erodibility[i] * Math.pow(sim.discharge[i], params.m));
  ys.push(Math.log(slope / predicted));
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const errors = ys.map(Math.abs).sort((a, b) => a - b);
const median = errors[errors.length >> 1];
check(
  ys.length > 100 && median < 0.05,
  `slope matches (U + G Ū)/(K Q^m) at ${ys.length} points (median error ${(median * 100).toFixed(2)}%, mean log ratio ${mean(ys).toFixed(4)})`,
);

process.exit(failures ? 1 : 0);
