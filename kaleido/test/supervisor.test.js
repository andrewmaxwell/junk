// The supervisor, against a stand-in app: a script that does what a plan
// file says on each run (exit with a code, die from a signal, or wait for
// the "restart when safe" message).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  supervise,
  afterExit,
  safeToRestart,
  RESTART,
} from '../server/supervisor.js';

const STUB = `
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname;
const runs = fs.readFileSync(dir + 'runs', 'utf8').length;
fs.appendFileSync(dir + 'runs', 'x');
const step = JSON.parse(fs.readFileSync(dir + 'plan.json', 'utf8'))[runs];
if (step.exit != null) process.exit(step.exit);
if (step.kill) process.kill(process.pid, 'SIGKILL');
if (step.awaitRestart) {
  fs.writeFileSync(dir + 'waiting', '');
  process.on('message', (m) => m.type === 'restartWhenSafe' && process.exit(${RESTART}));
}
`;

function stubApp(plan, {testPasses = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaleido-sup-'));
  for (const d of ['server', 'test']) fs.mkdirSync(path.join(root, d));
  fs.writeFileSync(path.join(root, 'app.mjs'), STUB);
  fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify(plan));
  fs.writeFileSync(path.join(root, 'runs'), '');
  fs.writeFileSync(
    path.join(root, 'test', 'a.test.js'),
    `import {test} from 'node:test'; test('t', () => { if (${!testPasses}) throw new Error('nope'); });`,
  );
  const said = [];
  const run = supervise({
    script: path.join(root, 'app.mjs'),
    args: [],
    root,
    heartbeatFile: path.join(root, '.heartbeat'),
    log: (m) => process.env.SUPLOG && console.log('LOG', m),
    say: (text) => said.push(text),
  });
  const runs = () => fs.readFileSync(path.join(root, 'runs'), 'utf8').length;
  return {root, run, runs, said};
}

const until = async (cond, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

test('restarts only when no batch is at stake', () => {
  assert.ok(safeToRestart(null));
  assert.ok(safeToRestart({phase: 'PREHEAT', batch: null}));
  assert.ok(safeToRestart({phase: 'OFF', batch: null}));
  assert.ok(
    !safeToRestart({phase: 'READY', batch: null}),
    'beans may be going in',
  );
  assert.ok(!safeToRestart({phase: 'ROASTING', batch: {}}));
  assert.ok(!safeToRestart({phase: 'PREHEAT', batch: {}}), 'record still open');
});

test('a quit is a quit; a crash restarts, until it keeps crashing', () => {
  const now = 1_000_000;
  const exit = (o) => afterExit({now, crashes: [], quitAt: null, ...o});
  assert.equal(exit({code: 0}), 'stop');
  assert.equal(exit({code: null, signal: 'SIGTERM'}), 'stop');
  assert.equal(exit({code: 1}), 'crashed');
  assert.equal(
    exit({code: null, signal: 'SIGKILL'}),
    'crashed',
    'killed for hanging',
  );
  assert.equal(exit({code: 1, quitAt: now - 2000}), 'stop', 'Ctrl-C twice');
  assert.equal(exit({code: RESTART}), 'restart');
  const three = [now - 60_000, now - 30_000, now - 1000];
  assert.equal(exit({code: 1, crashes: three}), 'give up');
  assert.equal(
    exit({code: 1, crashes: three.map((t) => t - 3600_000)}),
    'crashed',
  );
});

test('a crashing app is restarted, then given up on, out loud', async () => {
  const s = stubApp([{exit: 1}, {kill: true}, {exit: 1}, {exit: 1}, {exit: 0}]);
  await s.run;
  assert.equal(s.runs(), 4, 'three restarts, then it stops trying');
  assert.equal(s.said.length, 4);
  assert.match(s.said.at(-1), /keeps crashing/);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});

test('new code: tests pass, the app is asked to restart, and it comes back', async () => {
  const s = stubApp([{awaitRestart: true}, {exit: 0}]);
  await until(() => fs.existsSync(path.join(s.root, 'waiting')));
  fs.writeFileSync(path.join(s.root, 'server', 'x.js'), '// changed');
  await s.run;
  assert.equal(s.runs(), 2);
  assert.deepEqual(s.said, [], 'a planned restart is quiet');
});

test('new code that fails the tests is not loaded', async () => {
  const s = stubApp([{awaitRestart: true}], {testPasses: false});
  await until(() => fs.existsSync(path.join(s.root, 'waiting')));
  fs.writeFileSync(path.join(s.root, 'server', 'x.js'), '// broken');
  await new Promise((r) => setTimeout(r, 3000));
  assert.equal(s.runs(), 1, 'the old app is still running');
  // End the stand-in app the way a user would.
  process.emit('SIGTERM');
  await s.run;
});
