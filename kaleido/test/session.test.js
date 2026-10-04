// Whole sessions against the simulated roaster, on a virtual clock (an hour
// of roasting takes well under a second).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {createVirtualClock} from '../server/clock.js';
import {Machine} from '../server/machine.js';
import {SimKaleido} from '../server/sim.js';
import {Session} from '../server/session.js';
import {loadProcedure} from '../server/procedure.js';
import {autopilot} from '../server/autopilot.js';

const preheat = JSON.parse(
  fs.readFileSync(new URL('../preheat.json', import.meta.url), 'utf8'),
);
const ESPRESSO = {
  bean: 'colombian_supremo',
  variant: 'espresso',
  weightIn: 155,
};
const POUROVER = {...ESPRESSO, variant: 'pourover'};
const HOUR = 3600_000;

function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function setup({dropRate = 0.15, sim, clock} = {}) {
  clock ??= createVirtualClock();
  sim ??= new SimKaleido({clock, dropRate, random: seeded(7)});
  const machine = new Machine({clock, openTransport: () => sim.open()});
  const session = new Session({machine, clock, preheat, loadProcedure});
  const log = [];
  for (const e of ['phase', 'say', 'alert', 'charge', 'tp', 'fc', 'sc'])
    session.on(e, (a, b) => log.push({e, t: clock.now(), a, b}));
  for (const e of ['step', 'drop', 'beansOut', 'batchComplete'])
    session.on(e, (a, b) => log.push({e, t: clock.now(), a, b}));
  machine.run();
  return {clock, sim, machine, session, log};
}

const phases = (log) => log.filter((x) => x.e === 'phase').map((x) => x.a);
const said = (log) => log.filter((x) => x.e === 'say').map((x) => x.a);

async function finish({clock, machine}) {
  const stopped = machine.stop();
  await clock.advance(5000);
  await stopped;
}

test('a two-batch session, start to all-off, with 15% of commands dropped', async () => {
  const ctx = setup();
  const {clock, sim, session, log} = ctx;
  session.start();
  let off = false;
  autopilot(session, sim, clock, {batches: [ESPRESSO, POUROVER]}).then(
    () => (off = true),
  );
  await clock.until(() => off, 3 * HOUR, 5000);

  assert.deepEqual(phases(log), [
    'PREHEAT',
    'READY',
    'ROASTING',
    'PREHEAT',
    'READY',
    'ROASTING',
    'PREHEAT',
    'SHUTDOWN',
    'OFF',
  ]);
  const batches = log.filter((x) => x.e === 'batchComplete').map((x) => x.a);
  assert.deepEqual(
    batches.map((b) => b.variant),
    ['espresso', 'pourover'],
  );
  for (const b of batches) {
    assert.ok(b.tp.BT > 95 && b.tp.BT < 125, `TP ${b.tp.BT}`);
    assert.deepEqual(
      b.steps.map((s) => s.bt),
      [154, 175, 178, 190, 194, 198],
    );
    for (const s of b.steps) assert.ok(s.BT >= s.bt && s.BT < s.bt + 2);
    assert.equal(b.drop.reason, 'temperature');
    assert.ok(b.drop.BT >= b.proc.drop.bt && b.drop.BT < b.proc.drop.bt + 2);
    assert.ok(b.fc && b.beansOut);
    assert.ok(b.samples.length > 300);
  }
  // The second preheat starts hot, so it's shorter than the first.
  const ready = log.filter((x) => x.e === 'phase' && x.a === 'READY');
  const drop1 = log.find((x) => x.e === 'drop').t;
  assert.ok(ready[1].t - drop1 < ready[0].t);
  // Everything off at the end.
  assert.deepEqual(
    {HS: sim.m.HS, HP: sim.m.HP, FC: sim.m.FC, RC: sim.m.RC, CS: sim.m.CS},
    {HS: 0, HP: 0, FC: 0, RC: 0, CS: 0},
  );
  await finish(ctx);
});

test('after the drop it preheats again with the cooling fan on', async () => {
  const ctx = setup({dropRate: 0});
  const {clock, sim, session, log} = ctx;
  session.start();
  autopilot(session, sim, clock, {
    batches: [ESPRESSO, ESPRESSO],
    coolingMs: HOUR,
  });
  await clock.until(() => log.some((x) => x.e === 'drop'), 2 * HOUR, 5000);
  await clock.advance(10_000);
  assert.equal(session.phase, 'PREHEAT');
  assert.deepEqual(
    {TS: sim.m.TS, AH: sim.m.AH, HS: sim.m.HS, FC: sim.m.FC, RC: sim.m.RC},
    {TS: 185, AH: 1, HS: 1, FC: 30, RC: 90},
  );
  assert.equal(sim.m.CS, 1);
  session.setCooling(false);
  await clock.advance(5000);
  assert.equal(sim.m.CS, 0);
  await finish(ctx);
});

test("won't call for or detect a charge until the beans are chosen", async () => {
  const ctx = setup({dropRate: 0});
  const {clock, sim, session, log} = ctx;
  session.start();
  await clock.until(() => session.phase === 'READY', HOUR, 5000);
  assert.match(said(log).at(-1), /choose the next beans/i);
  sim.chargeBeans(155);
  await clock.advance(60_000);
  assert.equal(session.phase, 'READY');
  await finish(ctx);
});

test('second crack drops immediately', async () => {
  const ctx = setup();
  const {clock, sim, session, log} = ctx;
  session.start();
  autopilot(session, sim, clock, {batches: [ESPRESSO], scAt: 200});
  await clock.until(() => log.some((x) => x.e === 'drop'), 2 * HOUR, 5000);
  const drop = log.find((x) => x.e === 'drop').b;
  assert.equal(drop.reason, 'second crack');
  assert.ok(drop.BT >= 200 && drop.BT < 202);
  await finish(ctx);
});

test('an override beats the procedure until released', async () => {
  const ctx = setup();
  const {clock, sim, session, log} = ctx;
  session.start();
  autopilot(session, sim, clock, {batches: [ESPRESSO]});
  await clock.until(() => log.some((x) => x.e === 'tp'), 2 * HOUR, 1500);
  session.override('burner', 70);
  // Steps at 154 and 175 come and go; the burner stays where the user put it.
  await clock.until(() => session.batch.steps.length >= 2, HOUR, 1500);
  await clock.advance(5000);
  assert.equal(sim.m.HP, 70);
  assert.deepEqual(session.batch.steps[1].overridden, ['burner']);
  assert.equal(sim.m.FC, 40, 'air still follows the procedure');
  session.release('burner');
  await clock.advance(5000);
  assert.equal(sim.m.HP, 40);
  await finish(ctx);
});

test('done mid-roast shuts down after the drop instead of preheating', async () => {
  const ctx = setup();
  const {clock, sim, session, log} = ctx;
  session.start();
  session.selectBatch(ESPRESSO);
  await clock.until(() => session.phase === 'READY', HOUR, 5000);
  sim.chargeBeans(155);
  await clock.until(() => session.phase === 'ROASTING', HOUR, 1500);
  session.done();
  await clock.until(() => log.some((x) => x.e === 'drop'), HOUR, 5000);
  sim.discharge();
  assert.equal(session.phase, 'SHUTDOWN');
  await clock.until(() => session.phase === 'OFF', 2 * HOUR, 5000);
  await finish(ctx);
});

test('a restart mid-roast picks up where it left off', async () => {
  const clock = createVirtualClock();
  const sim = new SimKaleido({clock, dropRate: 0.15, random: seeded(3)});
  const a = setup({clock, sim});
  a.session.start();
  autopilot(a.session, sim, clock, {batches: [ESPRESSO]});
  await clock.until(() => a.session.batch?.steps.length === 3, 2 * HOUR, 1500);
  const saved = JSON.parse(JSON.stringify(a.session.toJSON()));
  // The process dies: nothing is listening and the port closes. The roaster
  // carries on with its last settings.
  a.session.removeAllListeners();
  a.session.detach();
  await finish(a);
  await clock.advance(20_000);

  const b = setup({clock, sim});
  b.session.start(saved);
  assert.equal(b.session.phase, 'ROASTING');
  await clock.until(() => b.log.some((x) => x.e === 'drop'), HOUR, 1500);
  const steps = b.log.filter((x) => x.e === 'step').map((x) => x.b.bt);
  assert.deepEqual(steps, [190, 194, 198], 'no step fires twice');
  const drop = b.log.find((x) => x.e === 'drop').b;
  assert.ok(drop.BT >= 207.4 && drop.BT < 209.4);
  await finish(b);
});

test('a cable pull mid-roast raises the alarm, then the roast carries on', async () => {
  const ctx = setup();
  const {clock, sim, session, log} = ctx;
  session.start();
  autopilot(session, sim, clock, {batches: [ESPRESSO]});
  await clock.until(() => session.batch?.steps.length === 2, 2 * HOUR, 1500);
  sim.close();
  await clock.advance(3000);
  const alert = log.find((x) => x.e === 'alert');
  assert.equal(alert.a.level, 'urgent');
  assert.match(alert.a.text, /disconnected/);
  await clock.until(() => log.some((x) => x.e === 'drop'), HOUR, 1500);
  assert.equal(session.batch.steps.length, 6);
  await finish(ctx);
});
