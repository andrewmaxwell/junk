#!/usr/bin/env node
// Kaleido M1 LITE roast controller
//
// Usage:
//   node roast/main.js              run against the real roaster
//   node roast/main.js --simulate   run against a built-in fake machine (no hardware)
//   node roast/main.js --quick      shorten the preheat-stability wait (dry runs)
//
// --simulate implies --quick.

import readline from 'readline';
import {SIM} from './config.js';
import {s} from './state.js';
import {sleep} from './util.js';
import {send, flushWrites} from './io.js';
import {connectionManager} from './connection.js';
import {
  charge,
  triggerEnd,
  silenceDrop,
  adjustBurner,
  tick,
} from './control.js';
import {render, enterAltScreen, leaveAltScreen} from './display.js';
import {exportRecording} from './recording.js';

let pollIv, tickIv, dispIv;
let shuttingDown = false;

// Turn every actuator off, end the start guard, and exit. Safe to call from any
// phase or signal handler; only runs once.
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  clearInterval(pollIv);
  clearInterval(tickIv);
  clearInterval(dispIv);
  leaveAltScreen(); // back to the normal terminal so messages below are visible

  // Mark the run terminal so connectionManager stops trying to reconnect (and
  // re-arm the guard) while we're shutting actuators down.
  const wasRoasting = s.phase === 'ROASTING' || s.phase === 'COOLING';
  if (s.phase !== 'ABORTED') s.phase = 'DONE';
  if (wasRoasting) exportRecording();

  if (s.port?.isOpen) {
    // Everything off: auto-PID, burner, air, drum, heater, cooling fan. The M1
    // silently drops commands sometimes (this is why the drum used to keep
    // spinning after quit), so resend the whole set until the machine echoes 0
    // for every actuator — or we run out of attempts.
    const offs = [
      ['AH', 0],
      ['HP', 0],
      ['FC', 0],
      ['RC', 0],
      ['HS', 0],
      ['CS', 0],
    ];
    for (let attempt = 0; attempt < 4; attempt++) {
      for (const [t, v] of offs) send(t, v);
      await flushWrites();
      send('RD', 'A0'); // ask the machine to report back so we can verify
      await flushWrites();
      await sleep(SIM ? 20 : 300);
      if ([s.HP, s.FC, s.RC, s.HS, s.CS].every((v) => v === 0 || v == null))
        break;
    }
    send('CL', 'AR'); // end safety guard, last
    await flushWrites();
    await sleep(SIM ? 20 : 150);
    try {
      s.port.close();
    } catch {
      /* ignore */
    }
  }

  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
  }

  if (code === 0) {
    process.stdout.write('\n  Everything off. Bye.\n');
  }
  process.exit(code);
}

async function main() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  enterAltScreen();

  process.stdin.on('keypress', (_, key) => {
    if (!key) return;
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      shutdown(0);
      return;
    }
    if (key.name === 'd' && s.phase === 'ROASTING') {
      triggerEnd(); // manual drop / end override
      return;
    }
    if (key.name === 'up') return adjustBurner(5); // manual burner nudge
    if (key.name === 'down') return adjustBurner(-5);
    if (key.name === 'return' || key.name === 'enter') {
      if (s.phase === 'READY') charge();
      else if (s.phase === 'ROASTING' && !s.firstCrack)
        s.firstCrack = Date.now();
      else if (s.phase === 'COOLING') silenceDrop();
    }
  });

  pollIv = setInterval(() => {
    if (s.port?.isOpen && s.sid != null && s.phase !== 'PREFLIGHT')
      send('RD', 'A0');
  }, 1500);
  tickIv = setInterval(tick, 1000);
  dispIv = setInterval(render, 500);

  await connectionManager();

  if (s.phase === 'ABORTED') {
    leaveAltScreen();
    const failed = s.checks
      .filter((c) => c.status === 'fail')
      .map((c) => c.name);
    process.stdout.write(`\n  Self-test failed: ${failed.join(', ')}\n`);
    process.stdout.write('  Roaster NOT preheated. Fix it and try again.\n');
    await shutdown(1);
    return;
  }
  await shutdown(0);
}

process.on('SIGINT', () => shutdown(0));

main().catch(async (err) => {
  leaveAltScreen();
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
  }
  console.error(err);
  process.exit(1);
});
