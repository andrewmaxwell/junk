import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClock} from '../server/clock.js';
import {encode, parse} from '../server/protocol.js';
import {Machine} from '../server/machine.js';
import {SimKaleido} from '../server/sim.js';

const PREHEAT = {TS: 185, HS: 1, AH: 1, FC: 30, RC: 90};

// A deterministic "random" so drop-rate tests are repeatable.
function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

async function setup({speed = 200, dropRate = 0} = {}) {
  const clock = createClock(speed);
  const sim = new SimKaleido({clock, dropRate, random: seeded(42)});
  const machine = new Machine({openTransport: () => sim.open(), clock});
  const errors = [];
  machine.on('error', (e) => errors.push(e.message));
  machine.run();
  await until(clock, () => machine.connected, 10_000);
  return {clock, sim, machine, errors};
}

// Waits up to `ms` of simulated time for cond() to be true.
async function until(clock, cond, ms) {
  const end = clock.now() + ms;
  while (!cond()) {
    if (clock.now() > end) throw new Error('timed out');
    await clock.sleep(100);
  }
}

test('protocol encodes like Artisan and parses replies', () => {
  assert.equal(encode('PI'), '{[PI]}\n');
  assert.equal(encode('TS', 207.4), '{[TS 207]}\n');
  assert.equal(encode('RD', 'A0'), '{[RD A0]}\n');
  assert.deepEqual(parse('{3,BT:185.2,HP:45,TU:C,SN:ab}'), {
    sid: 3,
    vars: {BT: 185.2, HP: 45, TU: 'C', SN: 'ab'},
  });
  assert.equal(parse('garbage'), null);
});

test('desired state converges even when the machine drops a third of commands', async () => {
  const {clock, sim, machine} = await setup({dropRate: 0.33});
  machine.set(PREHEAT);
  await until(clock, () => machine.settled(), 30_000);
  assert.deepEqual(
    {TS: sim.m.TS, HS: sim.m.HS, AH: sim.m.AH, FC: sim.m.FC, RC: sim.m.RC},
    PREHEAT,
  );
  await machine.stop();
});

test('switching to manual sends TS, then AH 0, then HP, even with drops', async () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const clock = createClock(200);
    const sim = new SimKaleido({clock, dropRate: 0.4, random: seeded(seed)});
    const machine = new Machine({openTransport: () => sim.open(), clock});
    machine.run();
    machine.set(PREHEAT);
    await until(clock, () => machine.settled(), 30_000);
    sim.accepted.length = 0;
    machine.set({TS: 230, AH: 0, HP: 55});
    await until(clock, () => machine.settled(), 30_000);
    const order = sim.accepted.map((a) => a.tag);
    assert.ok(
      order.indexOf('TS') < order.indexOf('AH'),
      `seed ${seed}: ${order}`,
    );
    assert.ok(
      order.indexOf('AH') < order.indexOf('HP'),
      `seed ${seed}: ${order}`,
    );
    assert.equal(sim.m.HP, 55);
    await machine.stop();
  }
});

test('HP is left alone in auto mode', async () => {
  const {clock, sim, machine} = await setup();
  machine.set({...PREHEAT, HP: 0});
  await clock.sleep(10_000);
  assert.ok(!sim.accepted.some((a) => a.tag === 'HP'));
  assert.ok(machine.settled());
  await machine.stop();
});

test('reconnects after a cable pull and re-applies the desired state', async () => {
  const {clock, sim, machine} = await setup();
  machine.set(PREHEAT);
  await until(clock, () => machine.settled(), 10_000);
  const events = [];
  machine.on('disconnected', () => events.push('disconnected'));
  machine.on('connected', () => events.push('connected'));
  sim.close();
  sim.m.FC = 0; // something changed while we were away
  await until(clock, () => events.includes('connected'), 10_000);
  await until(clock, () => machine.settled(), 10_000);
  assert.deepEqual(events, ['disconnected', 'connected']);
  assert.equal(sim.m.FC, 30);
  await machine.stop();
});

test('a silent machine counts as disconnected, then recovers', async () => {
  const {clock, sim, machine, errors} = await setup();
  let down = false;
  machine.on('disconnected', () => (down = true));
  sim.muted = true;
  await until(clock, () => down, 15_000);
  assert.match(errors.join(), /stopped answering/);
  sim.muted = false;
  await until(clock, () => machine.connected, 15_000);
  await machine.stop();
});

test('reports a control that never takes', async () => {
  const {clock, sim, machine} = await setup();
  const stuck = [];
  machine.on('stuck', (s) => stuck.push(s));
  sim.dropRate = 1;
  sim.random = () => 0;
  machine.set({FC: 55});
  await until(clock, () => stuck.length > 0, 20_000);
  assert.deepEqual(stuck[0], {control: 'FC', want: 55, got: 0});
  await machine.stop();
});
