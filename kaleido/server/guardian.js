// The guardian: a separate process that turns the burner off if the app
// dies or hangs. Needed because the roaster has no panel and keeps heating on
// its own when the computer goes quiet (self-test watchdog, 2026-10-04).
//
// main.js starts it (detached) when the app starts:
//   node kaleido/server/guardian.js <app pid> <heartbeat file>
// The app touches the heartbeat file every 2 s and deletes it on a clean exit.
//   - file gone            → the app exited cleanly; the guardian exits too
//   - app process gone     → it crashed or was killed; its port is free now
//   - heartbeat > 15 s old → it's hung; kill it so the port frees up
// In the last two cases the guardian turns the heater off (fans keep running
// if it's hot), says so out loud, and exits.

import fs from 'fs';
import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import {emergencyStop} from './stop.js';

export const HEARTBEAT_MS = 2000;
export const HUNG_MS = 15_000;

// One look. Returns 'ok', 'clean' (stop watching), or why to step in.
export function assess({heartbeatAge, appAlive}) {
  if (heartbeatAge == null) return 'clean';
  if (!appAlive) return 'the app stopped';
  if (heartbeatAge > HUNG_MS) return 'the app stopped responding';
  return 'ok';
}

export async function guard({
  pid,
  heartbeatFile,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
  isAlive = (p) => {
    try {
      process.kill(p, 0);
      return true;
    } catch {
      return false;
    }
  },
  kill = (p) => process.kill(p, 'SIGKILL'),
  stop = () => emergencyStop(),
  announce = (text) => spawn('say', [text], {stdio: 'ignore'}),
  log = console.log,
}) {
  for (;;) {
    let heartbeatAge = null;
    try {
      heartbeatAge = now() - fs.statSync(heartbeatFile).mtimeMs;
    } catch {
      // gone: a clean exit
    }
    const verdict = assess({heartbeatAge, appAlive: isAlive(pid)});
    if (verdict === 'clean') return 'clean';
    if (verdict !== 'ok') {
      log(`guardian: ${verdict}; turning the heater off`);
      if (isAlive(pid)) kill(pid);
      // The port frees up once the app is gone; retry until the stop lands.
      let result;
      for (let i = 0; i < 5; i++) {
        await sleep(1000);
        result = await stop();
        if (result.ok) break;
      }
      log(`guardian: ${result.message}`);
      announce(
        result.ok
          ? `Roaster app ${verdict.replace('the app ', '')}. Heater off.`
          : 'Roaster app stopped and I could not turn the heater off. Unplug the roaster.',
      );
      try {
        fs.unlinkSync(heartbeatFile);
      } catch {
        // already gone
      }
      return verdict;
    }
    await sleep(1000);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [pid, heartbeatFile] = process.argv.slice(2);
  await guard({pid: Number(pid), heartbeatFile});
  process.exit(0);
}
