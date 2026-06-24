// Full-screen terminal display, redrawn in place.

import {TITLE, QUICK, recipe} from './config.js';
import {s} from './state.js';
import {calcRoR} from './control.js';

const W = 44;
const sep = `╠${'─'.repeat(W - 2)}╣`;

const bar10 = (pct) => {
  const n = Math.max(0, Math.min(10, Math.round((pct ?? 0) / 10)));
  return '█'.repeat(n) + '░'.repeat(10 - n);
};
const fmtTemp = (v) => (v == null ? ' ---.-' : v.toFixed(1).padStart(6));
const fmtPct = (v) => (v == null ? '--' : String(v).padStart(3));
const onOff = (v) => (v == null ? '--' : v ? 'ON' : 'off');
const fmtMs = (ms) => {
  if (ms == null) return '--:--';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};

function row(left, right = '') {
  // Content area is W-6: the two border glyphs plus two spaces of padding each
  // side. Keep this in sync with the W-2-wide borders/separators.
  const inner = right ? left + right.padStart(W - 6 - left.length) : left;
  return `║  ${inner.padEnd(W - 6)}  ║`;
}

export const enterAltScreen = () => {
  if (process.stdout.isTTY) process.stdout.write('\x1b[?1049h\x1b[?25l');
};
export const leaveAltScreen = () => {
  if (process.stdout.isTTY) process.stdout.write('\x1b[?25h\x1b[?1049l');
};

function paint(lines, footer) {
  if (footer) lines.push(footer);
  // Redraw in place: home the cursor, write each line followed by \x1b[K to wipe
  // any leftover characters to its right (e.g. from a previously wider frame),
  // then \x1b[0J to clear anything below. Avoids both the scrollback spam of a
  // full clear (\x1b[2J) and stray edge artifacts from line-length changes.
  const frame = lines.map((l) => l + '\x1b[K').join('\n');
  process.stdout.write('\x1b[H' + frame + '\n\x1b[0J');
}

function renderPreflight() {
  const aborted = s.phase === 'ABORTED';
  const icon = {running: '…', pass: '✓', fail: '✗'};
  const label = {running: '...', pass: 'OK', fail: 'FAIL'};
  const lines = [
    `╔${'═'.repeat(W - 2)}╗`,
    row(TITLE, aborted ? 'SELF-TEST FAILED' : 'SELF-TEST'),
    sep,
  ];
  for (const c of s.checks)
    lines.push(
      row(`${icon[c.status] ?? '·'} ${c.name}`, label[c.status] ?? ''),
    );
  lines.push(`╚${'═'.repeat(W - 2)}╝`);
  paint(
    lines,
    aborted
      ? '  Self-test failed — fix the issue and restart.'
      : '  Running pre-roast self-test...',
  );
}

export function render() {
  if (s.phase === 'PREFLIGHT' || s.phase === 'ABORTED')
    return renderPreflight();

  const now = Date.now();
  const {phase} = s;
  const roasting = phase === 'ROASTING';
  const active = roasting || phase === 'COOLING' || phase === 'DONE';
  const phaseStr =
    phase === 'COOLING'
      ? s.beansOut
        ? 'COOLING'
        : 'DROP BEANS!'
      : ({
          CONNECTING: 'CONNECTING...',
          PREHEATING: 'PREHEATING',
          READY: 'READY',
          ROASTING: '● REC',
          DONE: 'DONE',
        }[phase] ?? phase);

  const lines = [`╔${'═'.repeat(W - 2)}╗`, row(TITLE, phaseStr), sep];

  if (active) {
    const elapsed = (roasting ? now : s.endTime) - s.chargeTime;
    const note = roasting
      ? '(recording)'
      : phase === 'COOLING'
        ? '(timer stopped)'
        : '(complete)';
    lines.push(row(`  ${fmtMs(elapsed)}  ${note}`));
    lines.push(sep);
  }

  lines.push(row(`Bean Temp   ${fmtTemp(s.BT)} °C`));
  lines.push(row(`Exhaust     ${fmtTemp(s.ET)} °C`));
  lines.push(row(`Ambient     ${fmtTemp(s.AT)} °C`));
  // Target only matters while the PID owns the burner (preheat). In manual
  // roasting it's stale, so hide it to avoid confusion.
  if (phase === 'PREHEATING' || phase === 'READY')
    lines.push(row(`Target      ${fmtTemp(s.TS)} °C`));
  if (active) {
    const ror = calcRoR();
    const rorStr =
      ror == null ? '  --.-' : (ror >= 0 ? '+' : '') + ror.toFixed(1);
    lines.push(row(`RoR         ${rorStr.padStart(6)} °C/min`));
  }
  lines.push(sep);
  lines.push(row(`Burner  [${bar10(s.HP)}] ${fmtPct(s.HP)}%`));
  lines.push(row(`Air     [${bar10(s.FC)}] ${fmtPct(s.FC)}%`));
  lines.push(row(`Drum    [${bar10(s.RC)}] ${fmtPct(s.RC)}%`));
  // Burner bar shows live PID duty in auto mode; Heater is the master switch.
  lines.push(row(`Heater       ${onOff(s.HS)}`, `Cooling  ${onOff(s.CS)}`));
  // Heating mode: AUTO-PID tracks the Target setpoint; MANUAL means HP drives the
  // burner directly (what we want once charged). Shown during/after a roast so a
  // stuck-at-setpoint BT is diagnosable at a glance. Target only matters in auto.
  if (active)
    lines.push(
      row(
        `Mode    ${s.AH ? 'AUTO-PID' : 'MANUAL'}`,
        s.AH ? `Target ${fmtTemp(s.TS)} °C` : '',
      ),
    );

  if (phase === 'PREHEATING' && s.stableStart) {
    const elapsed = now - s.stableStart;
    const total = recipe.preheat.stableSeconds * 1000;
    lines.push(sep);
    lines.push(
      row(
        `Stable  [${bar10((elapsed / total) * 100)}] ${fmtMs(elapsed)} / ${fmtMs(total)}`,
      ),
    );
  }

  if (phase === 'READY') {
    lines.push(sep);
    lines.push(row('*** READY FOR CHARGE ***'));
  }

  // Checklist of what's happened and what's still pending, each with its time.
  // ✓ = done (shows MM:SS since charge), · = waiting.
  if (active) {
    const checkRow = (label, t) =>
      row(
        `${t != null ? '✓' : '·'} ${label}`,
        t != null ? fmtMs(t - s.chargeTime) : '',
      );
    lines.push(sep);
    lines.push(row('Steps'));
    lines.push(checkRow('Charge', s.chargeTime));
    lines.push(
      checkRow(
        s.turningPoint
          ? `Turn ${s.turningPoint.BT.toFixed(0)}°C`
          : 'Turning point',
        s.turningPoint?.time,
      ),
    );
    recipe.tempSteps.forEach((st, i) =>
      lines.push(checkRow(`${st.temp}°C`, s.stepTimes[i])),
    );
    lines.push(checkRow('1st crack', s.firstCrack));
    lines.push(checkRow(`${recipe.dropTemp}°C drop`, s.endTime));
    if (s.beansOut) lines.push(checkRow('Beans out', s.beansOutTime));
  }

  lines.push(`╚${'═'.repeat(W - 2)}╝`);

  const footer =
    phase === 'CONNECTING'
      ? '  Waiting for Kaleido M1 (plug in via USB)...'
      : phase === 'READY'
        ? '  Press ENTER to add beans and start recording'
        : roasting && !s.firstCrack
          ? '  ↑↓ burner • ENTER 1st crack • d drop • q quit'
          : roasting
            ? `  ↑↓ burner • waiting ${recipe.dropTemp}°C • d drop • q quit`
            : phase === 'COOLING' && !s.beansOut
              ? '  DROP BEANS NOW!  •  ENTER when out  •  q quit'
              : phase === 'COOLING'
                ? '  Beans out — cooling. Press q when done.'
                : phase === 'DONE'
                  ? '  Roast complete. Recording saved.'
                  : '  q quit';
  paint(lines, footer + (QUICK && !active ? '   [quick]' : ''));
}
