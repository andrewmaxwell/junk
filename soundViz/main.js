import {
  ensureMic,
  beginTake,
  endTake,
  isArming,
  audioContext,
} from './recorder.js';
import * as audio from './playback.js';
import {
  createRenderer,
  analyze,
  draw,
  clear,
  exportImage,
  sampleCell,
  setBusyHandler,
  F_MIN,
} from './render.js';
import {fullView, isFullView, zoomFactor, attachGestures} from './zoom.js';

const MIN_SAMPLES = 4096; // ~85 ms; shorter than this there is nothing to transform

// Deep enough to be past anything the analysis can still resolve. Zooming
// further is allowed — it simply stops adding detail, which is a thing worth
// being able to see for yourself. Same for frequency: a thousandth of an
// octave is well past the point of no return.
const MIN_SPAN = 24;
const MIN_RATIO = 1.001;

const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// Nearest equal-tempered note. Only worth showing once the viewport is inside
// an octave: any wider and naming the two ends says nothing you could not read
// off the numbers.
const NOTE_RATIO = 2;

// Below this coherence the readout declines to name a sweep direction. The
// drive is a ratio whose denominator is the coherent power on that pixel, so
// as coherence goes to zero it is a confident-looking number computed from
// almost nothing — and the picture agrees, because it rotates hue by
// `drive * conf` and so shows no tint there either. Placed above the measured
// means for white noise and two-component loops (~0.09 and ~0.40 once ridge
// support is folded in), and below what a real ridge keeps even while beating
// (~0.61).
const SWEEP_MIN_CONF = 0.4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function note(f) {
  const n = Math.round(69 + 12 * Math.log2(f / 440));
  return `${NOTES[n % 12]}${Math.floor(n / 12) - 1}`;
}

// The frequencies at the bottom and top of the viewport. Decimals come from the
// *span* rather than the magnitude: a thousandth of an octave up at 700 Hz is a
// band less than a hertz wide, and "700-700 Hz" would be no readout at all.
function band(f0, f1) {
  const kilo = f0 >= 1000;
  const scale = kilo ? 1000 : 1;
  const dp = clamp(Math.ceil(-Math.log10((f1 - f0) / scale / 4)), 0, 3);
  const range = `${(f0 / scale).toFixed(dp)}–${(f1 / scale).toFixed(dp)} ${kilo ? 'kHz' : 'Hz'}`;

  if (f1 / f0 > NOTE_RATIO) {
    return range;
  }

  const lo = note(f0);
  const hi = note(f1);

  return `${range} · ${lo === hi ? lo : `${lo}–${hi}`}`;
}

// A single frequency, for the inspect readout — `band()` above is for the two
// ends of a viewport, and one end alone wants its own precision rule.
function freqLabel(f) {
  const kilo = f >= 1000;
  const v = kilo ? f / 1000 : f;
  const dp = kilo ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(dp)} ${kilo ? 'kHz' : 'Hz'} · ${note(f)}`;
}

const canvas = document.getElementById('view');
const status = document.getElementById('status');
const hint = document.getElementById('hint');
const inspectEl = document.getElementById('inspect');
const inspectHead = document.getElementById('inspect-head');
const inspectRows = document.getElementById('inspect-rows');
const busyEl = document.getElementById('busy');
const closeBtn = document.getElementById('close');
const pinEl = document.getElementById('pin');
const playheadEl = document.getElementById('playhead');

const accelerated = createRenderer(canvas);

// The analysis runs on a pool of workers, so the page stays live while it is
// going. The spinner is the only sign that anything is happening at all — it
// sits next to the readout it is about to refine, and it animates on the
// compositor so it keeps turning through whatever the main thread is doing.
setBusyHandler((on) => busyEl.classList.toggle('show', on));

// The newest analysis in flight, so a save can wait for the cloud to settle
// rather than exporting one that is about to be replaced.
let analysing = null;

function track(promise) {
  const done = promise.finally(() => {
    if (analysing === done) {
      analysing = null;
    }
  });

  analysing = done;

  return done;
}

let rec = null; // the recording being displayed
let viewport = null;
let limits = null;

let take = null; // start position of the live take
let opening = false; // ensureMic still in flight
let released = false; // button let go before the mic opened
let ticker = null;
let nagTimer = null;
let pressAt = 0; // event timestamp of the press being served
let saving = false;
let sawArming = false; // the mic was still opening partway through this take

// How long ago the button actually went down, as opposed to when we got round
// to noticing. Event timestamps share an origin with performance.now().
const lag = () => Math.max(0, performance.now() - pressAt);

const held = new Set(); // pointers currently down
let quietUntil = 0; // suppress the short-take nag right after a gesture

// Hold to record, drag to pan. The two are only ambiguous when there is
// something to pan, and they stay ambiguous for this long: past it the press is
// committed to a recording, so a hand that drifts mid-take does not throw it
// away. Waiting costs no audio — `beginTake` reaches back by the real press
// time and the sound is already in the ring buffer.
const HOLD_MS = 180;

let holdTimer = null;

// Two different questions, both answered once per press and both off the same
// event. `canPan` gates the drag; `hasPicture` gates the wait that lets a tap
// mean something. They are not the same predicate — a tap reads the picture at
// every zoom, while only a zoomed-in view has anywhere to pan to — but
// `canPan` implies `hasPicture`, so the gesture code can never arm a drag on a
// press this file decided to record immediately.
const canPan = () => !!rec && !isFullView(viewport, limits);
const hasPicture = () => !!rec;

function cancelHold() {
  if (holdTimer === null) {
    return false;
  }

  clearTimeout(holdTimer);
  holdTimer = null;

  return true;
}

function setStatus(text, recording) {
  clearTimeout(nagTimer);
  status.textContent = text;
  status.className = recording ? 'rec' : '';
}

// What the picture in front of you is: how far in, how much time it covers,
// and which band. Shown from the moment a recording exists and never taken
// away — at full view it reads `1x`, which is worth saying rather than leaving
// the corner blank and the numbers to be guessed at.
function showZoom() {
  // While something is playing, the status line is describing that instead —
  // panning around mid-playback should not silently retitle what you are
  // listening to.
  if (audio.isPlaying()) {
    return;
  }

  if (!rec) {
    setStatus('', false);
    return;
  }

  const ms = ((viewport.t1 - viewport.t0) / rec.sampleRate) * 1000;
  const span =
    ms < 10
      ? `${ms.toFixed(1)} ms`
      : ms < 1000
        ? `${Math.round(ms)} ms`
        : `${(ms / 1000).toFixed(2)} s`;
  const zoom = `${zoomFactor(viewport, limits).toFixed(0)}x`;

  setStatus(
    `${zoom} · ${span} across · ${band(viewport.f0, viewport.f1)}`,
    false,
  );
}

const inspectOpen = () => inspectEl.classList.contains('show');

function hideInspect() {
  inspectEl.classList.remove('show');
  pinEl.classList.remove('show');
}

// Anchored to the point that was read, not to a fixed corner — the whole point
// is that it is about *there*, not about the picture in general. The pin marks
// the exact pixel, because at these zooms a tooltip a few pixels off would be
// describing a different partial than the one under it.
function showInspectAt(x, y, title, rows) {
  inspectHead.textContent = title;
  inspectRows.textContent = '';

  for (const [label, value, none] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;

    const dd = document.createElement('dd');
    dd.textContent = value;

    if (none) {
      dd.className = 'none';
    }

    inspectRows.append(dt, dd);
  }

  // Shown before measuring: a `display: none` box has no size to place.
  inspectEl.classList.add('show');

  const half = inspectEl.offsetWidth / 2 + 8;
  const above = y - inspectEl.offsetHeight - 14 > 8;

  inspectEl.style.left = `${clamp(x, half, window.innerWidth - half)}px`;
  inspectEl.style.top = `${above ? y - 14 : y + 14}px`;
  inspectEl.style.transform = above
    ? 'translate(-50%, -100%)'
    : 'translate(-50%, 0)';

  pinEl.style.left = `${x}px`;
  pinEl.style.top = `${y}px`;
  pinEl.classList.add('show');
}

// The close button sits over the canvas, so its press must not reach the
// window handler below — that would hide the readout and then immediately
// reopen it, since the point tapped is still a point of the picture.
closeBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  hideInspect();
});

// A tap that never became a hold or a drag: report what is at that point of
// the picture instead of doing nothing with it. Available at every zoom,
// full view included — the numbers are as meaningful there as anywhere, and
// the only press that cannot spare a second meaning is one made before any
// recording exists.
function inspect(x, y) {
  if (!rec) return;

  const rect = canvas.getBoundingClientRect();
  const u = (x - rect.left) / rect.width;
  const v = (y - rect.top) / rect.height;

  if (u < 0 || u > 1 || v < 0 || v > 1) return;

  const t = viewport.t0 + u * (viewport.t1 - viewport.t0);
  const l0 = Math.log(viewport.f0);
  const l1 = Math.log(viewport.f1);
  const f = Math.exp(l0 + (1 - v) * (l1 - l0));

  const ms = (t / rec.sampleRate) * 1000;
  const spanMs = ((viewport.t1 - viewport.t0) / rec.sampleRate) * 1000;
  const dp = clamp(Math.ceil(-Math.log10(spanMs / 4)), 0, 3);
  const timeLabel =
    ms < 1000
      ? `${ms.toFixed(dp)} ms`
      : `${(ms / 1000).toFixed(Math.max(dp, 2))} s`;

  const rows = [['time', timeLabel]];
  const sample = sampleCell(u, v, f);

  if (!sample) {
    // Empty is not the same as quiet — nothing landed on this pixel at all,
    // which is a real answer and worth giving rather than a fabricated floor.
    rows.push(['signal', 'nothing here', true]);
  } else {
    const db = Math.round(sample.aboveBg);

    rows.push(['level', `${db >= 0 ? '+' : ''}${db} dB`]);
    rows.push(['coherence', `${Math.round(sample.conf * 100)}%`]);

    // The sweep drive is a coherence-weighted average over everything that
    // landed on this pixel, not a per-partial measurement — reported as a
    // lean, the same word the picture's own hue uses for it, not as a rate in
    // Hz/s it cannot actually support. And not reported at all where nothing
    // corroborates the direction it came from.
    const mag = Math.round(Math.abs(sample.drive) * 100);

    if (sample.conf < SWEEP_MIN_CONF) {
      rows.push(['sweep', 'not corroborated', true]);
    } else if (mag < 15) {
      rows.push(['sweep', 'steady', true]);
    } else {
      rows.push([
        'sweep',
        `${sample.drive > 0 ? 'rising' : 'falling'} ${mag}%`,
      ]);
    }
  }

  showInspectAt(x, y, freqLabel(f), rows);
}

let playFrame = null;

function stopPlaying() {
  if (!audio.isPlaying()) {
    return;
  }

  audio.stop();
  cancelAnimationFrame(playFrame);
  playFrame = null;
  playheadEl.classList.remove('show');
  showZoom();
}

// The playhead is a DOM element rather than something drawn into the picture,
// and deliberately: a full-view redraw costs ~90 ms, so animating a line by
// re-rendering would cost more per frame than the whole analysis budget allows.
// Nothing about the picture changes while it sweeps.
function trackPlayhead() {
  const ctx = audioContext();

  const step = () => {
    const at = audio.playhead(ctx);

    if (at === null) {
      return;
    }

    const u = (at - viewport.t0) / (viewport.t1 - viewport.t0);

    // The clip can be wider than the viewport — a very short view is widened to
    // something audible — so for part of each pass the playhead is genuinely
    // outside the picture. Hiding it is the honest answer; parking it at the
    // edge would claim the sound is somewhere it is not.
    if (u < 0 || u > 1) {
      playheadEl.classList.remove('show');
    } else {
      playheadEl.style.left = `${u * window.innerWidth}px`;
      playheadEl.classList.add('show');
    }

    playFrame = requestAnimationFrame(step);
  };

  step();
}

function togglePlay() {
  if (audio.isPlaying()) {
    stopPlaying();
    return;
  }

  if (!rec) return;

  const ctx = audioContext();

  if (!ctx) return;

  // A key press is a user gesture, so this is allowed to resume a context the
  // browser suspended while the page sat idle.
  if (ctx.state === 'suspended') ctx.resume();

  const clip = audio.play(ctx, rec, viewport);

  if (!clip) return;

  const ms = ((clip.t1 - clip.t0) / clip.sampleRate) * 1000;
  const span =
    ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

  // Say when what you are hearing is wider than what you are looking at,
  // rather than letting the difference pass as if it were not there.
  const wider = [clip.widenedTime && 'time', clip.widenedBand && 'band'].filter(
    Boolean,
  );
  const caveat = wider.length ? ` · wider in ${wider.join(' and ')}` : '';

  setStatus(`▶ ${span} · ${band(clip.f0, clip.f1)}${caveat}`, false);
  trackPlayhead();
}

async function press(pressedAt) {
  if (take !== null || opening) return;

  // The mic is about to open and the speakers are playing the last thing it
  // heard. Stop, or the take is a recording of the recording.
  stopPlaying();

  pressAt = pressedAt;
  opening = true;
  released = false;
  setStatus('● REC', true);

  try {
    await ensureMic();
  } catch (err) {
    opening = false;
    setStatus(`mic unavailable: ${err.message}`, false);
    return;
  }
  opening = false;

  if (released) {
    // let go while the mic was still opening
    finish(endTake(beginTake(lag())));
    return;
  }
  take = beginTake(lag());
  sawArming = isArming();
  const started = performance.now();
  ticker = setInterval(() => {
    const arming = isArming();
    sawArming = sawArming || arming;
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(arming ? '● opening mic…' : `● REC ${elapsed}s`, true);
  }, 100);
}

function release() {
  if (opening) {
    released = true;
    return;
  }
  if (take === null) return;
  const from = take;
  take = null;
  finish(endTake(from));
}

// A second finger means the gesture was never a recording. Throw the take away
// rather than rendering whatever was caught before the pinch started.
function abort() {
  cancelHold();
  clearInterval(ticker);
  ticker = null;
  opening = false;
  released = false;

  if (take !== null) {
    endTake(take);
    take = null;
  }

  quietUntil = performance.now() + 600;
  showZoom();
}

function finish(result) {
  clearInterval(ticker);
  ticker = null;

  if (result.samples.length < MIN_SAMPLES) {
    if (performance.now() > quietUntil) {
      // Distinguish "you tapped" from "the mic had not finished opening yet",
      // which is only ever the first hold and is not the user's fault.
      setStatus(
        sawArming
          ? 'mic was still opening — hold again'
          : 'hold a little longer',
        false,
      );

      // A stray tap should not cost the zoom readout its place.
      nagTimer = setTimeout(showZoom, 1600);
    }
    return;
  }

  rec = result;

  limits = {
    tMin: 0,
    tMax: rec.samples.length,
    fMin: F_MIN,
    fMax: rec.sampleRate / 2,
    minSpan: MIN_SPAN,
    minRatio: MIN_RATIO,
  };

  viewport = fullView(limits);

  // The readout describes the view before there is anything in it, and the
  // spinner beside it says the picture is on its way. Nothing here blocks: the
  // pool does the work and this returns to the event loop immediately.
  showZoom();

  track(
    analyze(canvas, rec, viewport, true).then(() => {
      hint.textContent =
        'Hold to record · tap to read · drag to pan · scroll to zoom · P to play · S to save';
      draw(canvas, viewport);
      showZoom();
    }),
  );
}

let framePending = false;

function requestFrame() {
  if (framePending || !rec) return;
  framePending = true;
  requestAnimationFrame(() => {
    framePending = false;
    draw(canvas, viewport);
    showZoom();
  });
}

// Write out what is on screen, several times larger. The cloud is the same one
// being displayed, so this is genuinely the same picture at a higher
// resolution, not an upscale of the screen.
async function save() {
  if (saving) return;
  saving = true;

  try {
    // Exporting a cloud that is about to be replaced would write out the
    // coarser of the two pictures, and swapping mid-export would tear it.
    if (analysing) {
      setStatus('saving… waiting for the analysis', false);
      await analysing;
    }

    const {blob, W, H} = await exportImage(canvas, viewport, (done, total) =>
      setStatus(`saving… ${Math.round((100 * done) / total)}%`, false),
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soundviz-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
    a.click();

    // Chrome reads the blob after the click returns; revoking now would cancel
    // a download this size.
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    setStatus(`saved ${W}x${H}`, false);
    nagTimer = setTimeout(showZoom, 2400);
  } finally {
    saving = false;
    draw(canvas, viewport);
  }
}

const gestures = attachGestures(canvas, {
  getView: () => viewport,
  setView: (v) => {
    viewport = v;
  },
  getLimits: () => limits,
  onGesture: () => {
    if (!rec) return;
    quietUntil = performance.now() + 600;
    requestFrame();
  },
  // The cloud in hand covers the whole recording until the zoom outruns the
  // budget, so most gestures never reach this at all.
  onSettle: () => {
    if (!rec || saving) return;

    track(
      analyze(canvas, rec, viewport, false).then(() => {
        draw(canvas, viewport);
        showZoom();
      }),
    );
  },
  onMultiTouch: abort,
  canPan,
  // A drag is not a recording. Throw away whatever the press had started
  // rather than rendering the moment before the pan.
  onDragStart: abort,
});

// The whole screen is the button, so this works the same under a finger.
window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  hideInspect();
  held.add(e.pointerId);

  if (held.size > 1) {
    abort();
    return;
  }

  // With nothing on screen there is nothing to tap and nowhere to pan, so the
  // press can only mean "record" and does so at once. This is every press made
  // before the first recording exists.
  if (!hasPicture()) {
    press(e.timeStamp);
    return;
  }

  const at = e.timeStamp;

  cancelHold();
  holdTimer = setTimeout(() => {
    holdTimer = null;

    // Held long enough to be a take, so it is one from here on: the gesture
    // handler must stop watching this press for a drag, or a hand that drifts
    // mid-recording would abort it.
    gestures.cancelDrag();
    press(at);
  }, HOLD_MS);
});

function lift(e) {
  const wasHeld = held.delete(e.pointerId);
  if (held.size > 0 || !wasHeld) return;

  // Let go before the press committed to anything: a tap, not a take. Report
  // what is under it rather than doing nothing with it.
  if (cancelHold()) {
    inspect(e.clientX, e.clientY);
    return;
  }

  release();
}

window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
window.addEventListener('blur', () => {
  held.clear();
  cancelHold();
  release();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && rec) {
    // One layer at a time, outermost first: the sound, then the readout, then
    // the zoom. Each of these is something you would want to back out of
    // without losing the one under it — dismissing a tooltip must not also
    // throw away the view it was opened from.
    if (audio.isPlaying()) {
      stopPlaying();
      return;
    }

    if (inspectOpen()) {
      hideInspect();
      return;
    }

    viewport = fullView(limits);
    requestFrame();
    track(analyze(canvas, rec, viewport, false).then(requestFrame));
    return;
  }
  if (e.code === 'KeyS' && rec) {
    save();
    return;
  }
  if (e.code === 'KeyP' && rec && !e.repeat) {
    togglePlay();
    return;
  }
  if (e.code !== 'Space' || e.repeat) return;
  e.preventDefault();
  press(e.timeStamp);
});
window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  release();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // An export is drawing tiles through the same buffers and yielding between
    // them, so a pass landing halfway through would change the picture it is
    // writing out. The save ends with a redraw at whatever size the window is
    // by then, so nothing is left stale.
    if (saving) {
      return;
    }

    if (!rec) {
      if (accelerated) {
        clear(canvas);
      } else {
        hint.textContent =
          'This needs WebGL2 — try a current Chrome, Safari or Firefox';
      }
      return;
    }

    track(
      analyze(canvas, rec, viewport, true).then(() => {
        draw(canvas, viewport);
        showZoom();
      }),
    );
  }, 100);
});

if (accelerated) {
  clear(canvas);
} else {
  hint.textContent =
    'This needs WebGL2 — try a current Chrome, Safari or Firefox';
}
