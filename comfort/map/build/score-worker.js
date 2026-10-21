// Scores one slice of the grid for each hour `score.js` hands it, adding into
// the shared stats. Imports `comfort.js` directly rather than copying it, so the
// map can never quietly disagree with the app about what comfortable means.

import {parentPort, workerData} from 'node:worker_threads';
import {ACTIVITIES, scoreComfort} from '../../js/comfort.js';
import {ACTIVITY_KEYS, FACTORS, GOOD_SCORE, STAT_FIELDS} from './common.js';

const {statsBuffer, zoneBuffer, fields, count, monthCount, from, to} =
  workerData;
const stats = new Uint16Array(statsBuffer);
const zone = new Uint8Array(zoneBuffer);
const activities = ACTIVITY_KEYS.map((key) => ACTIVITIES[key]);
const fieldCount = STAT_FIELDS.length;
const factorOffset = STAT_FIELDS.indexOf(FACTORS[0]);
const factorIndex = Object.fromEntries(FACTORS.map((key, i) => [key, i]));

// The factor that cost the most. The model's own limiter is preferred, but it
// stays silent below its notability floor, and an hour that missed Good still
// has to be charged to something.
function blame({penalties, limiter}) {
  if (limiter) return limiter;
  let worst = null;
  for (const [key, value] of Object.entries(penalties))
    if (!worst || value > penalties[worst]) worst = key;
  return worst;
}

parentPort.on('message', ({hourBuffer, zoneMonth}) => {
  const values = new Float32Array(hourBuffer);
  for (let c = from; c < to; c++) {
    const month = zoneMonth[zone[c]];
    if (month < 0) continue;

    // Missing CAMS values arrive as NaN; the model wants null, which drops
    // the air factor and reads UV as zero, exactly as the app does without
    // them.
    const row = {};
    for (let f = 0; f < fields.length; f++) {
      const v = values[f * count + c];
      row[fields[f]] = Number.isNaN(v) ? null : v;
    }
    if (row.temperature_2m === null) continue;

    for (let a = 0; a < activities.length; a++) {
      const result = scoreComfort(row, {activity: activities[a]});
      const base =
        ((c * activities.length + a) * monthCount + month) * fieldCount;
      stats[base] += 1;
      stats[base + 2] += result.score;
      if (result.score >= GOOD_SCORE) stats[base + 1] += 1;
      else stats[base + factorOffset + factorIndex[blame(result)]] += 1;
    }
  }
  parentPort.postMessage('done');
});
