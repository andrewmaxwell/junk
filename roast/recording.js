// Roast recording export.

import fs from 'fs';
import {SIM, recipe} from './config.js';
import {s} from './state.js';

const relTime = (t) =>
  t != null && s.chargeTime != null
    ? +((t - s.chargeTime) / 1000).toFixed(1)
    : null;

export function exportRecording() {
  if (s.exported) return;
  s.exported = true;
  if (!s.recording.length) return; // nothing roasted (e.g. quit during preheat)
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const filename = `roast-${SIM ? 'sim-' : ''}${ts}.json`;
  const out = {
    date: new Date().toISOString(),
    simulated: SIM,
    recipe,
    events: {
      charge: 0,
      turningPoint: s.turningPoint ? relTime(s.turningPoint.time) : null,
      turningPointBT: s.turningPoint ? s.turningPoint.BT : null,
      firstCrack: relTime(s.firstCrack),
      drop: relTime(s.endTime),
    },
    data: s.recording,
  };
  fs.writeFileSync(filename, JSON.stringify(out, null, 2));
  process.stdout.write(`\n  Saved: ${filename}\n`);
}
