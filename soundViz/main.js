import {ensureMic, beginTake, endTake, isArming} from './recorder.js';
import {createRenderer, analyze, draw, clear, exportImage, F_MIN} from './render.js';
import {fullView, isFullView, zoomFactor, attachGestures} from './zoom.js';

const MIN_SAMPLES = 4096; // ~85 ms; shorter than this there is nothing to transform

// Deep enough to be past anything the analysis can still resolve. Zooming
// further is allowed — it simply stops adding detail, which is a thing worth
// being able to see for yourself. Same for frequency: a thousandth of an
// octave is well past the point of no return.
const MIN_SPAN = 24;
const MIN_RATIO = 1.001;

const canvas = document.getElementById('view');
const status = document.getElementById('status');
const hint = document.getElementById('hint');

const accelerated = createRenderer(canvas);

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

function setStatus(text, recording) {
  clearTimeout(nagTimer);
  status.textContent = text;
  status.className = recording ? 'rec' : '';
}

function showZoom() {
  if (!rec || isFullView(viewport, limits)) {
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
  setStatus(`${zoomFactor(viewport, limits).toFixed(0)}x · ${span} across`, false);
}

async function press(pressedAt) {
  if (take !== null || opening) return;
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
      setStatus(sawArming ? 'mic was still opening — hold again' : 'hold a little longer', false);

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

  // The analysis blocks the main thread for a second or so, so hand the browser
  // a moment to paint the status first — otherwise the only sign of life is the
  // page going still. A timer rather than a frame callback: a backgrounded tab
  // fires no frame callbacks at all, and a take made just before switching away
  // would sit unanalysed until you came back.
  setStatus('analysing…', false);
  setTimeout(() => {
    analyze(canvas, rec, viewport, true);
    setStatus('', false);
    hint.textContent = 'Hold to record · scroll or pinch to zoom · S to save';
    draw(canvas, viewport);
  }, 24);
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

attachGestures(canvas, {
  getView: () => viewport,
  setView: v => {
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
    analyze(canvas, rec, viewport, false);
    draw(canvas, viewport);
    showZoom();
  },
  onMultiTouch: abort,
});

// The whole screen is the button, so this works the same under a finger.
window.addEventListener('pointerdown', e => {
  e.preventDefault();
  held.add(e.pointerId);

  if (held.size > 1) {
    abort();
    return;
  }

  press(e.timeStamp);
});

function lift(e) {
  const wasHeld = held.delete(e.pointerId);
  if (held.size > 0 || !wasHeld) return;
  release();
}

window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
window.addEventListener('blur', () => {
  held.clear();
  release();
});

window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && rec) {
    viewport = fullView(limits);
    analyze(canvas, rec, viewport, false);
    requestFrame();
    return;
  }
  if (e.code === 'KeyS' && rec) {
    save();
    return;
  }
  if (e.code !== 'Space' || e.repeat) return;
  e.preventDefault();
  press(e.timeStamp);
});
window.addEventListener('keyup', e => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  release();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!rec) {
      if (accelerated) {
        clear(canvas);
      } else {
        hint.textContent = 'This needs WebGL2 — try a current Chrome, Safari or Firefox';
      }
      return;
    }

    analyze(canvas, rec, viewport, true);
    draw(canvas, viewport);
    showZoom();
  }, 100);
});

if (accelerated) {
  clear(canvas);
} else {
  hint.textContent = 'This needs WebGL2 — try a current Chrome, Safari or Firefox';
}
