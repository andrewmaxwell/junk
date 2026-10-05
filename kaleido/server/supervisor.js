// Keeps the app running, and restarts it to load new code.
//
// `node kaleido/server/main.js` on the real roaster starts this, and this
// runs the app itself as a child (main.js --child). `--no-supervisor` skips it.
//
// - The app crashed (or the guardian killed it for hanging): the heater is
//   already off, so restart right away and let the saved session resume.
//   Every second off costs a roast in progress. More than MAX_CRASHES in
//   CRASH_WINDOW_MS means a bug that will just crash again: stop, and say so.
// - Code changed (server/*.js, preheat.json, beans.json): run the tests,
//   and if they pass, ask the app to restart when it's safe (safeToRestart).
//   If they fail, the app keeps running the old code.
// - The app quit normally (Ctrl-C, or killed with SIGTERM): stop too.
//
// Before restarting, wait for the guardian to finish (it deletes the
// heartbeat file when it's done): otherwise the new app and the guardian
// fight over the serial port.

import fs from 'fs';
import path from 'path';
import {spawn, execFile} from 'child_process';

export const RESTART = 75; // exit code: "start me again" (heater already off)
const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 10 * 60_000;
const QUIT_GRACE_MS = 10_000; // a Ctrl-C this recently means the user quit
const GUARDIAN_WAIT_MS = 30_000;

// Whether the app can restart without risk to a batch. Never mid-roast, or
// while its record is still open. Never in READY either: a restart resumes
// READY as PREHEAT, and beans poured in during PREHEAT aren't detected.
export function safeToRestart(session) {
  if (!session) return true;
  if (session.batch) return false;
  return ['PREHEAT', 'SHUTDOWN', 'OFF'].includes(session.phase);
}

// What to do after the app exits. crashes: times of earlier crashes.
export function afterExit({code, signal, now, crashes, quitAt}) {
  if (code === RESTART) return 'restart';
  if (quitAt != null && now - quitAt < QUIT_GRACE_MS) return 'stop';
  if (code === 0 && !signal) return 'stop';
  if (signal === 'SIGTERM') return 'stop';
  const recent = crashes.filter((t) => now - t < CRASH_WINDOW_MS);
  return recent.length >= MAX_CRASHES ? 'give up' : 'crashed';
}

export async function supervise({
  script,
  args,
  root,
  heartbeatFile,
  log = (msg) => console.log(`supervisor: ${msg}`),
  say = (text) => spawn('say', [text], {stdio: 'ignore'}),
}) {
  const crashes = [];
  let quitAt = null;
  let child = null;

  // Ctrl-C reaches the app directly (same terminal); it decides whether to
  // quit. Just remember it, so its exit isn't taken for a crash.
  const onInt = () => (quitAt = Date.now());
  const onTerm = () => {
    quitAt = Date.now();
    child?.kill('SIGTERM');
  };
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);

  const unwatch = watchCode(root, async () => {
    log('code changed; running the tests');
    const ok = await runTests(root, log);
    if (!ok) {
      log('tests FAILED: still running the old code (see above)');
      return;
    }
    log('tests pass; the app restarts the next time no batch is at stake');
    if (child?.connected) child.send({type: 'restartWhenSafe'});
  });

  try {
    await keepRunning();
  } finally {
    unwatch();
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }

  async function keepRunning() {
    for (;;) {
      child = spawn(process.execPath, [script, ...args, '--child'], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });
      const {code, signal} = await new Promise((resolve) =>
        child.once('exit', (c, s) => resolve({code: c, signal: s})),
      );
      const now = Date.now();
      const next = afterExit({code, signal, now, crashes, quitAt});
      if (next === 'stop') return;
      if (next === 'give up') {
        log('the app keeps crashing; not restarting it again. Heater is off.');
        say('The roaster app keeps crashing. The heater is off.');
        process.exitCode = 1;
        return;
      }
      if (next === 'crashed') {
        crashes.push(now);
        log(`the app stopped (${signal ?? `exit ${code}`}); restarting it`);
        say('Roaster app crashed. Restarting it.');
      } else log('restarting to load the new code');
      await guardianDone(heartbeatFile);
    }
  }
}

async function guardianDone(heartbeatFile) {
  const end = Date.now() + GUARDIAN_WAIT_MS;
  while (fs.existsSync(heartbeatFile) && Date.now() < end)
    await new Promise((r) => setTimeout(r, 250));
}

// Returns a function that stops watching.
function watchCode(root, onChange) {
  let timer = null;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 1000); // editors write files in bursts
  };
  const watchers = [
    fs.watch(path.join(root, 'server'), (e, file) => {
      if (file?.endsWith('.js')) changed();
    }),
    fs.watch(root, (e, file) => {
      if (file === 'preheat.json' || file === 'beans.json') changed();
    }),
  ];
  return () => {
    clearTimeout(timer);
    watchers.forEach((w) => w.close());
  };
}

function runTests(root, log) {
  const tests = fs
    .readdirSync(path.join(root, 'test'))
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(root, 'test', f));
  // Without NODE_TEST_CONTEXT: if this runs under a test runner, a nested
  // `node --test` would report to that runner instead of failing.
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  return new Promise((resolve) =>
    execFile(process.execPath, ['--test', ...tests], {env}, (err, stdout) => {
      if (err)
        log(
          stdout
            .split('\n')
            .filter((l) => /✖|fail/.test(l))
            .join('\n'),
        );
      resolve(!err);
    }),
  );
}
