// Pre-roast self-test: verify comms, sensors, and each actuator before preheat.

import {recipe} from './config.js';
import {s} from './state.js';
import {sleep} from './util.js';
import {send} from './io.js';
import {render} from './display.js';

const isLive = (v) =>
  typeof v === 'number' &&
  v > recipe.preflight.minTemp &&
  v < recipe.preflight.maxTemp;

// Command a control to a value and confirm the machine reports it back.
async function verifyControl(tag, value, tol = 2) {
  send(tag, value);
  for (let i = 0; i < 15; i++) {
    send('RD', 'A0');
    await sleep(200);
    if (typeof s[tag] === 'number' && Math.abs(s[tag] - value) <= tol)
      return true;
  }
  return false;
}

async function checkSensors() {
  for (let i = 0; i < 20; i++) {
    send('RD', 'A0');
    await sleep(200);
    if (isLive(s.BT) && isLive(s.ET)) return true;
  }
  return false;
}

async function checkBurner() {
  const up = await verifyControl('HP', recipe.preflight.burnerTest, 3);
  const down = await verifyControl('HP', 0, 1);
  return up && down;
}

// Pulse the dedicated cooling fan on, confirm it reports back, then off.
async function checkCooling() {
  const on = await verifyControl('CS', 1, 0);
  send('CS', 0);
  await sleep(200);
  return on;
}

export async function runPreflight() {
  const pf = recipe.preflight;
  s.phase = 'PREFLIGHT';
  s.checks = [
    {name: 'Communication link', fn: async () => s.sid != null},
    {name: 'Temperature sensors', fn: checkSensors},
    {name: 'Air damper control', fn: () => verifyControl('FC', pf.airTest)},
    {name: 'Drum motor control', fn: () => verifyControl('RC', pf.drumTest)},
    {name: 'Cooling fan', fn: checkCooling},
  ];
  if (pf.testBurner) s.checks.push({name: 'Burner control', fn: checkBurner});

  for (const c of s.checks) {
    c.status = 'running';
    render();
    try {
      c.status = (await c.fn()) ? 'pass' : 'fail';
    } catch {
      c.status = 'fail';
    }
    render();
  }

  // Return controls to a safe state before preheat takes over.
  send('FC', 0);
  send('RC', 0);
  send('HP', 0);
  send('CS', 0);
  return s.checks.every((c) => c.status === 'pass');
}
