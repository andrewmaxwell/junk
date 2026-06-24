// Roast control: phase transitions, the 1 Hz tick, and rate-of-rise.

import {recipe} from './config.js';
import {s} from './state.js';
import {beep, sleep} from './util.js';
import {send} from './io.js';

export function startPreheat() {
  const p = recipe.preheat;
  send('AH', 1); // auto-PID on
  send('HS', 1); // heater on — required, or the burner never fires (AH alone won't)
  send('TS', p.target); // set target temp
  send('FC', p.air);
  send('RC', p.drum);
}

function applyStep(step) {
  if (step.burner != null) send('HP', step.burner);
  if (step.air != null) send('FC', step.air);
  if (step.drum != null) send('RC', step.drum);
  if (step.cooling != null) send('CS', step.cooling);
  if (step.heater != null) send('HS', step.heater);
}

export async function charge() {
  // Raise the setpoint clear of the roast *first*. The Kaleido caps the burner
  // at whatever holds the current SV even after switching to manual, so leaving
  // it at the ~185 preheat target strangles BT there (confirmed on hardware,
  // and why Artisan tells you to set SV to max before going manual).
  send('TS', recipe.chargeStep.target);
  // Now leave auto-PID for manual heating. Confirm the machine reports AH:0
  // before we hand the burner to HP — resend if the first command was dropped.
  for (let i = 0; i < 10 && s.AH !== 0; i++) {
    send('AH', 0);
    send('RD', 'A0');
    await sleep(200);
  }
  applyStep(recipe.chargeStep); // manual burner + air; drum stays at preheat 90
  s.phase = 'ROASTING';
  s.chargeTime = Date.now();
  s.nextStep = 0;
  s.stepTimes = [];
  s.armed = false;
  s.turningPoint = null;
  s.beansOut = false;
  s.beansOutTime = null;
}

// Manual burner nudge (↑/↓ keys). Useful during an empty-drum dry run to prove
// the burner drives BT past the old PID setpoint — i.e. that we're truly in
// manual mode with no temperature ceiling. Auto temp-steps may override this
// once they fire during a real roast.
export function adjustBurner(delta) {
  if (s.phase !== 'ROASTING' && s.phase !== 'COOLING') return;
  const next = Math.max(0, Math.min(100, (s.HP ?? 0) + delta));
  send('HP', next);
}

// End the roast: burner + air off, cooling fan on, drum left at 90 so the beans
// tumble out. Used by BOTH the auto-drop (BT >= dropTemp) and the manual "d"
// key, so they behave identically. Guarded to ROASTING so a second trigger
// (e.g. d during cooling) is a no-op. The run does NOT finish here — we stay in
// COOLING, fan running, until the user quits.
export function triggerEnd() {
  if (s.phase !== 'ROASTING') return;
  applyStep(recipe.dropStep);
  s.phase = 'COOLING';
  s.endTime = Date.now();
  s.coolingBaseTemp = s.BT;
  s.beansOut = false;
  beep(4); // ding hard — drop the beans now
}

// Manual "the beans are out" — silence the drop alarm if the sensors didn't
// catch the temp drop. Does NOT end the run: the cooling fan and drum keep
// going until the user quits (q).
export function silenceDrop() {
  if (s.phase !== 'COOLING') return;
  s.beansOut = true;
  if (s.beansOutTime == null) s.beansOutTime = Date.now();
}

function record(now) {
  if (s.BT == null) return; // skip gaps during a reconnect blip
  s.recording.push({
    time: +((now - s.chargeTime) / 1000).toFixed(1),
    BT: s.BT,
    ET: s.ET,
    HP: s.HP,
    FC: s.FC,
    RC: s.RC,
    HS: s.HS,
    CS: s.CS,
  });
}

export function tick() {
  const now = Date.now();

  if (s.phase === 'PREHEATING') {
    const {target, toleranceDeg, stableSeconds} = recipe.preheat;
    if (s.BT != null && Math.abs(s.BT - target) <= toleranceDeg) {
      if (!s.stableStart) s.stableStart = now;
      if (now - s.stableStart >= stableSeconds * 1000) s.phase = 'READY';
    } else {
      s.stableStart = null;
    }
  }

  // Preheat's done and we're waiting for beans — keep dinging until charge
  // (Enter), in case nobody's at the machine after the long stability wait.
  if (s.phase === 'READY') beep();

  if (s.phase === 'ROASTING') {
    record(now);

    // Track the turning point (coolest BT after charge, as cold beans pull the
    // probe down before it climbs again).
    if (s.BT != null && (s.turningPoint == null || s.BT < s.turningPoint.BT))
      s.turningPoint = {time: now, BT: s.BT};

    // Right after charge the probe still reads the ~preheat temp, which is
    // already above the lower steps. Don't arm the temp triggers until BT has
    // dropped past the turning point (below the lowest step), so steps fire on
    // the way *up*, not instantly at charge.
    if (!s.armed && s.BT != null && s.BT < recipe.tempSteps[0].temp)
      s.armed = true;

    if (s.armed)
      while (s.nextStep < recipe.tempSteps.length) {
        const step = recipe.tempSteps[s.nextStep];
        if (s.BT != null && s.BT >= step.temp) {
          applyStep(step);
          s.stepTimes[s.nextStep] = now;
          s.nextStep++;
        } else break;
      }

    // Drop is independent and guaranteed: the moment BT crosses dropTemp the
    // roast ends, regardless of whether the intermediate steps ever armed. The
    // drop temp is above the charge/preheat temp, so this can't misfire at charge.
    if (s.BT != null && s.BT >= recipe.dropTemp) triggerEnd();
  }

  if (s.phase === 'COOLING') {
    record(now);
    // Beans confirmed out once BT has fallen dropTempDrop below where it was at
    // the drop — silence the alarm, but keep the cooling fan + drum running until
    // the user quits.
    if (
      !s.beansOut &&
      s.coolingBaseTemp != null &&
      s.BT != null &&
      s.coolingBaseTemp - s.BT > recipe.dropTempDrop
    ) {
      s.beansOut = true;
      s.beansOutTime = now;
    }
    if (!s.beansOut) beep(4); // ding like crazy until the beans are out
  }
}

// rate of rise over the configured window, °C/min
export function calcRoR() {
  const r = s.recording;
  if (r.length < 2) return null;
  const last = r[r.length - 1];
  let past = r[0];
  for (let i = r.length - 1; i >= 0; i--) {
    if (last.time - r[i].time >= recipe.rorWindowSec) {
      past = r[i];
      break;
    }
  }
  const dt = last.time - past.time;
  if (dt <= 0 || last.BT == null || past.BT == null) return null;
  return ((last.BT - past.BT) / dt) * 60;
}
