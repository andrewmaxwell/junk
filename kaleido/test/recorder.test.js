import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {createVirtualClock} from '../server/clock.js';
import {Machine} from '../server/machine.js';
import {SimKaleido} from '../server/sim.js';
import {Session} from '../server/session.js';
import {Recorder} from '../server/recorder.js';
import {loadProcedure} from '../server/procedure.js';
import {autopilot} from '../server/autopilot.js';
import {readAlog, parseAlog, toPython, channels} from '../server/alog.js';

const preheat = JSON.parse(
  fs.readFileSync(new URL('../preheat.json', import.meta.url), 'utf8'),
);
const beans = JSON.parse(
  fs.readFileSync(new URL('../beans.json', import.meta.url), 'utf8'),
);
const ESPRESSO = {
  bean: 'colombian_supremo',
  variant: 'espresso',
  weightIn: 155,
};
const HOUR = 3600_000;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaleido-'));
  // An older Artisan-only roast already in the directory.
  fs.writeFileSync(path.join(dir, '#41_brazil_cerrado_26-10-01_0900.alog'), '');
  const clock = createVirtualClock(Date.parse('2026-10-04T10:00:00'));
  const sim = new SimKaleido({clock});
  const machine = new Machine({clock, openTransport: () => sim.open()});
  let recorder;
  const session = new Session({
    machine,
    clock,
    preheat,
    loadProcedure,
    nextRoastNumber: () => recorder.nextRoastNumber(),
  });
  recorder = new Recorder({session, dir, beans});
  machine.run();
  session.start();
  return {dir, clock, sim, machine, session, recorder};
}

const files = (dir) => fs.readdirSync(dir).sort();

async function finish({clock, machine, dir}) {
  const stopped = machine.stop();
  await clock.advance(5000);
  await stopped;
  fs.rmSync(dir, {recursive: true});
}

test('Python literals round-trip', () => {
  const v = {a: [1, 2.5, -1], b: "it's \\ ok\nyes", c: true, d: null, e: {}};
  assert.deepEqual(parseAlog(toPython(v)), v);
});

test('a roast is written as it happens, then finalized', async () => {
  const ctx = setup();
  const {dir, clock, sim, session} = ctx;
  autopilot(session, sim, clock, {batches: [ESPRESSO]});
  await clock.until(() => session.batch?.steps.length === 2, 2 * HOUR, 1500);

  // Mid-roast: the files exist already, numbered after the highest roast.
  const base = '#42_colombian_supremo_espresso_26-10-04_1000';
  assert.deepEqual(files(dir).slice(1), [`${base}.alog`, `${base}.json`]);
  let d = readAlog(path.join(dir, `${base}.alog`));
  assert.equal(d.timeindex[6], 0, 'no drop yet');
  const charged = d.timeindex[0];
  assert.ok(
    Math.abs(d.temp2[charged] - 185) < 1.5,
    `CHARGE BT ${d.temp2[charged]}`,
  );

  await clock.until(() => session.phase === 'OFF', 3 * HOUR, 5000);
  d = readAlog(path.join(dir, `${base}.alog`));
  const side = JSON.parse(
    fs.readFileSync(path.join(dir, `${base}.json`), 'utf8'),
  );
  const [ci, dry, fc, , , , drop] = d.timeindex;
  assert.ok(ci < dry && dry < fc && fc < drop);
  assert.equal(d.computed.DROP_time, side.drop.t);
  assert.ok(d.computed.DROP_BT >= 207.4);
  assert.equal(d.title, 'Colombian Supremo (espresso)');
  assert.equal(d.roastbatchnr, 42);
  assert.deepEqual(d.weight, [155, 0, 'g']);
  assert.equal(d.signature, undefined, 'never claims to be from Artisan');
  // The burner/air changes are there as Artisan events, in roast order.
  const burner = d.specialevents
    .map((i, k) => [i, d.specialeventstype[k], d.specialeventsStrings[k]])
    .filter(([i, type]) => type === 3 && i > ci && i <= drop)
    .map(([, , s]) => s);
  assert.deepEqual(burner, ['Q55', 'Q45', 'Q40', 'Q35', 'Q30', 'Q25', 'Q15']);
  // The sidecar has what Artisan can't hold.
  assert.equal(side.steps.length, 6);
  assert.ok(side.steps.every((s, i) => i === 0 || s.t > side.steps[i - 1].t));
  assert.equal(side.procedure.version, 2);
  // And the simulator fit can read it like any other log.
  assert.equal(channels(d).HP.length, d.timex.length);
  await finish(ctx);
});

test('weight out and tasting notes patch the files later', async () => {
  const ctx = setup();
  const {dir, clock, sim, session, recorder} = ctx;
  autopilot(session, sim, clock, {batches: [ESPRESSO]});
  await clock.until(() => session.phase === 'OFF', 3 * HOUR, 5000);
  recorder.setWeightOut(42, 131.5);
  recorder.addNote(42, 'Chocolate, a bit flat.', new Date('2026-10-06'));
  const base = path.join(dir, '#42_colombian_supremo_espresso_26-10-04_1000');
  const d = readAlog(`${base}.alog`);
  assert.deepEqual(d.weight, [155, 131.5, 'g']);
  assert.equal(d.computed.weight_loss, 15.2);
  assert.equal(d.cuppingnotes, 'Chocolate, a bit flat.');
  const side = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
  assert.equal(side.weightOut, 131.5);
  assert.deepEqual(side.notes, [
    {date: '2026-10-06', text: 'Chocolate, a bit flat.'},
  ]);
  assert.throws(() => recorder.setWeightOut(99, 100), /no roast #99/);
  await finish(ctx);
});

test("a log that can't be saved doesn't stop the roast", async () => {
  const ctx = setup();
  const {dir, clock, sim, session} = ctx;
  // The folder vanishes and a file takes its place: every write now fails.
  fs.rmSync(dir, {recursive: true});
  fs.writeFileSync(dir, '');
  const alerts = [];
  session.on('alert', (a) => alerts.push(a));
  let off = false;
  autopilot(session, sim, clock, {batches: [ESPRESSO]}).then(
    () => (off = true),
  );
  await clock.until(() => off, 3 * HOUR, 5000);
  assert.ok(session.batch == null && session.phase === 'OFF');
  const saveAlerts = alerts.filter((a) => /couldn't save/i.test(a.text));
  assert.equal(saveAlerts.length, 1, 'reported once, not on every retry');
  fs.rmSync(dir);
  fs.mkdirSync(dir);
  await finish(ctx);
});
