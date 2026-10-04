// Entry point.
//
// App (the normal way to roast): serves the UI at http://localhost:3100/.
//   node kaleido/server/main.js                 real roaster
//   node kaleido/server/main.js --sim [--speed 10]   simulated roaster; the
//       UI gets buttons to pour beans in and discharge them. Roasts go to
//       kaleido/logs-sim/ (gitignored), never to logs/.
//   --port 3100 to change the port.
//
// Monitor: connects and prints every reading. Against the real roaster this
// never sets a control: it only does the handshake (PI, TU C, SC AR), polls
// (RD A0), and sends CL AR on exit.
//   node kaleido/server/main.js --monitor [--sim]
//
// Autopilot: a whole simulated session (two batches, then shutdown) in the
// terminal, with a simulated person charging, marking FC, and discharging.
//   node kaleido/server/main.js --sim --autopilot [--speed 20]
//
// Self-test: the empty-drum hardware checks in selftest.js. Asks before it
// fires the burner. The report goes to kaleido/selftests/ (logs-sim/ for --sim).
//   node kaleido/server/main.js --selftest [--no-heat] [--no-cable] [--sim]

import fs from 'fs';
import {createClock} from './clock.js';
import {Machine} from './machine.js';
import {SerialTransport} from './port.js';
import {SimKaleido} from './sim.js';
import {Session} from './session.js';
import {loadProcedure} from './procedure.js';
import {autopilot} from './autopilot.js';
import {Recorder} from './recorder.js';
import {runSelfTest} from './selftest.js';
import readline from 'readline';
import {startApp} from './app.js';

const args = process.argv.slice(2);
const SIM = args.includes('--sim');
const AUTOPILOT = SIM && args.includes('--autopilot');
const SELFTEST = args.includes('--selftest');
const MONITOR = args.includes('--monitor');
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 3100;
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

let app = null;
if (AUTOPILOT) runAutopilot();
else if (SELFTEST) runSelfTestCLI();
else if (MONITOR) {
  machine.on('sample', (r) => log(reading(r)));
  if (SIM) machine.set({TS: 185, HS: 1, AH: 1, FC: 30, RC: 90});
} else {
  const dir = new URL(SIM ? '../logs-sim/' : '../logs/', import.meta.url);
  app = startApp({machine, clock, sim, port: PORT, logsDir: dir.pathname});
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

async function runSelfTestCLI() {
  // Only an Enter pressed after the prompt counts: nobody should be able to
  // say "the drum is empty" in advance. In the sim there's nobody to ask.
  const rl = SIM ? null : readline.createInterface({input: process.stdin});
  const ask = (q) =>
    new Promise((resolve) => {
      log(`>>> ${q}`);
      if (SIM) resolve();
      else rl.once('line', resolve);
    });
  const report = await runSelfTest({
    machine,
    clock,
    log,
    ask,
    opts: {
      heat: !args.includes('--no-heat'),
      cable: !args.includes('--no-cable'),
      ...(SIM && {
        pullCable: () => {
          sim.unplugged = true;
          sim.close();
        },
        plugCable: () => (sim.unplugged = false),
      }),
    },
  });
  const dir = new URL(SIM ? '../logs-sim/' : '../selftests/', import.meta.url)
    .pathname;
  fs.mkdirSync(dir, {recursive: true});
  const stamp = report.startedAt.slice(0, 16).replace(/[:T]/g, '-');
  const file = `${dir}selftest_${stamp}.json`;
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  const failed = report.checks.filter((c) => !c.ok);
  log(
    failed.length
      ? `${failed.length} FAILED: ${failed.map((c) => c.name).join('; ')}`
      : `all ${report.checks.length} checks passed`,
  );
  log(`report: ${file}`);
  rl?.close();
  await machine.stop();
  process.exit(failed.length ? 1 : 0);
}

let quitting = false;
let warned = false;
process.on('SIGINT', async () => {
  if (quitting) process.exit(1);
  // Quitting the app mid-session leaves the roaster on its current settings.
  // That's survivable (restart within 30 min and the session resumes), but it
  // shouldn't happen by accident.
  const phase = app?.getSession()?.phase;
  if (phase && phase !== 'OFF' && !warned) {
    warned = true;
    log(`A session is running (${phase}). If you quit, the roaster keeps its`);
    log('current settings; restart within 30 min to resume. To end the day,');
    log('use "Done for today" in the UI instead. Ctrl-C again to quit anyway.');
    return;
  }
  quitting = true;
  log('stopping');
  // The self-test may have the burner lit. Monitor mode never touches the
  // controls, so it doesn't start now.
  if (SELFTEST && machine.connected) {
    machine.set({HS: 0, AH: 0, HP: 0, FC: 100, RC: 90});
    await Promise.race([
      new Promise((r) => {
        const poll = setInterval(() => {
          if (!machine.settled()) return;
          clearInterval(poll);
          r();
        }, 100);
      }),
      clock.sleep(10_000),
    ]);
    log('heater off; air and drum left running to cool the machine.');
    log('turn them off on the roaster once it has cooled.');
  }
  await machine.stop();
  process.exit(0);
});
