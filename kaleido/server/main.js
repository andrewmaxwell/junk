// Entry point. Until the browser UI exists (build step 5), there are two modes:
//
// Monitor: connects, prints every reading, reports disconnects and stuck
// controls. Against the real roaster this never sets a control: it only does
// the handshake (PI, TU C, SC AR), polls (RD A0), and sends CL AR on exit.
//   node kaleido/server/main.js                 real roaster, read-only
//   node kaleido/server/main.js --sim           simulated roaster, preheating
//
// Autopilot: a whole simulated session (two batches, then shutdown) with a
// simulated person doing the charging, FC marking, and discharging. The roasts
// are written to kaleido/logs-sim/ (gitignored), never to logs/.
//   node kaleido/server/main.js --sim --autopilot [--speed 20]

import fs from 'fs';
import {createClock} from './clock.js';
import {Machine} from './machine.js';
import {SerialTransport} from './port.js';
import {SimKaleido} from './sim.js';
import {Session} from './session.js';
import {loadProcedure} from './procedure.js';
import {autopilot} from './autopilot.js';
import {Recorder} from './recorder.js';

const args = process.argv.slice(2);
const SIM = args.includes('--sim');
const AUTOPILOT = SIM && args.includes('--autopilot');
const speedArg = args.indexOf('--speed');
const speed = SIM && speedArg >= 0 ? Number(args[speedArg + 1]) : 1;

const clock = createClock(speed);
const sim = SIM ? new SimKaleido({clock, dropRate: 0.1}) : null;
const machine = new Machine({
  clock,
  openTransport: () => (SIM ? sim.open() : new SerialTransport().open()),
});

const t0 = clock.now();
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const log = (msg) =>
  console.log(`${mmss(clock.now() - t0).padStart(6)}  ${msg}`);

machine.on('connected', () => log('connected'));
machine.on('disconnected', () => log('DISCONNECTED'));
machine.on('error', (err) => log(`error: ${err.message}`));
machine.on('stuck', ({control, want, got}) =>
  log(`STUCK: ${control} should be ${want} but reads ${got}`),
);

const f = (v, d = 0) => (v == null ? '-' : Number(v).toFixed(d));
const reading = (r) =>
  `BT ${f(r.BT, 1)}  ET ${f(r.ET, 1)}  SV ${f(r.TS)}  burner ${f(r.HP)}%` +
  `  air ${f(r.FC)}%  drum ${f(r.RC)}%  auto ${f(r.AH)}  heat ${f(r.HS)}` +
  `  cool ${f(r.CS)}`;

if (AUTOPILOT) runAutopilot();
else {
  machine.on('sample', (r) => log(reading(r)));
  if (SIM) machine.set({TS: 185, HS: 1, AH: 1, FC: 30, RC: 90});
}
machine.run();

function runAutopilot() {
  const preheat = JSON.parse(
    fs.readFileSync(new URL('../preheat.json', import.meta.url), 'utf8'),
  );
  const beans = JSON.parse(
    fs.readFileSync(new URL('../beans.json', import.meta.url), 'utf8'),
  );
  let recorder;
  const session = new Session({
    machine,
    clock,
    preheat,
    loadProcedure,
    nextRoastNumber: () => recorder.nextRoastNumber(),
  });
  const dir = new URL('../logs-sim/', import.meta.url).pathname;
  recorder = new Recorder({session, dir, beans});
  session.on('batchComplete', (b) => log(`wrote logs-sim/${b.file}.alog`));
  const at = (b) =>
    b?.charge ? ` (roast ${mmss(clock.now() - b.charge.t)})` : '';
  let lastPrint = 0;
  session.on('sample', (s) => {
    const every = s.phase === 'ROASTING' ? 15_000 : 60_000;
    if (s.t - lastPrint < every) return;
    lastPrint = s.t;
    log(`${s.phase.padEnd(9)} ${reading(s)}  RoR ${f(s.ror, 1)}`);
  });
  session.on('phase', (p) => log(`--- ${p}`));
  session.on('say', (text) => log(`SAY "${text}"${at(session.batch)}`));
  session.on('alert', (a) => log(`ALERT (${a.level}) ${a.text}`));
  session.on('step', (b, e) => {
    const what = [
      e.burner != null && `burner ${e.burner}%`,
      e.air != null && `air ${e.air}%`,
    ];
    log(`step at ${e.bt}: ${what.filter(Boolean).join(', ')}${at(b)}`);
  });
  session.on('tp', (b, e) => log(`turning point ${f(e.BT, 1)}${at(b)}`));
  session.on('fc', (b, e) =>
    log(`first crack marked at ${f(e.BT, 1)}${at(b)}`),
  );
  session.on('drop', (b, e) =>
    log(`dropped at ${f(e.BT, 1)} (${e.reason})${at(b)}`),
  );
  session.start();
  autopilot(session, sim, clock, {
    batches: [
      {bean: 'colombian_supremo', variant: 'espresso', weightIn: 155},
      {bean: 'colombian_supremo', variant: 'pourover', weightIn: 155},
    ],
  }).then(async () => {
    await machine.stop();
    process.exit(0);
  });
}

let quitting = false;
process.on('SIGINT', async () => {
  if (quitting) process.exit(1);
  quitting = true;
  log('stopping');
  await machine.stop();
  process.exit(0);
});
