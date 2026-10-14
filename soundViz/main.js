import {
  ensureMic,
  beginTake,
  endTake,
  isArming,
  audioContext,
  fadeEnds,
  RING_SECONDS,
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
  readAccum,
  snapshot,
  F_MIN,
} from './render.js';
import {fullView, isFullView, zoomFactor, attachGestures} from './zoom.js';
import {measure} from './probe.js';

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
const recBtn = document.getElementById('rec-btn');
const openBtn = document.getElementById('open-btn');
const playBtn = document.getElementById('play-btn');
const saveBtn = document.getElementById('save-btn');
const fileInput = document.getElementById('file');
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

// A pass that fails says so, rather than leaving a save waiting on it. Caught
// here so that what a save awaits always settles.
function track(promise) {
  const failed = promise.catch((err) => {
    console.error(err);
    setStatus(`analysis failed: ${err.message}`, false);
  });

  const done = failed.finally(() => {
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
let cancelled = false; // stop pressed while the mic was still opening
let ticker = null;
let nagTimer = null;
let pressAt = 0; // event timestamp of the press being served
let saving = false;
let sawArming = false; // the mic was still opening partway through this take

// How long ago an event actually happened, as opposed to when we got round to
// noticing. Event timestamps share an origin with performance.now().
const since = (at) => Math.max(0, performance.now() - at);

const canPan = () => !!rec && !isFullView(viewport, limits);

const recording = () => take !== null || opening;

function setStatus(text, recording) {
  clearTimeout(nagTimer);
  status.textContent = text;
  status.className = recording ? 'rec' : '';
}

// The buttons say what is possible right now: nothing to play or save until
// there is a picture, and record and play each show a stop icon while running.
function syncButtons() {
  recBtn.classList.toggle('on', recording());
  recBtn.title = recording() ? 'Stop recording (R)' : 'Record (R)';
  playBtn.classList.toggle('on', audio.isPlaying());
  playBtn.disabled = !rec;
  saveBtn.disabled = !rec || saving;
  hint.classList.toggle('hide', !!rec || recording());
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
// canvas handler below — that would hide the readout and then immediately
// reopen it, since the point tapped is still a point of the picture.
closeBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  hideInspect();
});

// A tap that never became a drag: report what is at that point of the picture
// instead of doing nothing with it. Available at every zoom, full view
// included — the numbers are as meaningful there as anywhere.
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
  syncButtons();
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
  syncButtons();
}

// Recording is a button, not a gesture: press to start, press again to stop.
// Both ends are timed from the press itself — `beginTake` and `endTake` reach
// back by how long ago it happened, so neither the click of the button nor a
// main thread busy with a commit moves where the take starts or stops.
async function startRecording(pressedAt) {
  if (recording()) return;

  // The mic is about to open and the speakers are playing the last thing it
  // heard. Stop, or the take is a recording of the recording.
  stopPlaying();
  hideInspect();

  pressAt = pressedAt;
  opening = true;
  cancelled = false;
  setStatus('● opening mic…', true);
  syncButtons();

  try {
    await ensureMic();
  } catch (err) {
    opening = false;
    setStatus(`mic unavailable: ${err.message}`, false);
    syncButtons();
    return;
  }

  opening = false;

  // Stopped before the mic was even open: nothing was recorded.
  if (cancelled) {
    showZoom();
    syncButtons();
    return;
  }

  take = beginTake(since(pressAt));
  sawArming = isArming();
  syncButtons();

  const started = performance.now();

  ticker = setInterval(() => {
    const arming = isArming();
    sawArming = sawArming || arming;
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(arming ? '● opening mic…' : `● REC ${elapsed}s`, true);
  }, 100);
}

function stopRecording(pressedAt) {
  if (opening) {
    cancelled = true;
    return;
  }

  if (take === null) return;

  const from = take;
  take = null;
  clearInterval(ticker);
  ticker = null;

  const result = endTake(from, since(pressedAt));

  if (result.samples.length < MIN_SAMPLES) {
    // Distinguish "too short" from "the mic had not finished opening yet",
    // which is only ever the first take and is not the user's fault.
    setStatus(
      sawArming ? 'mic was still opening — try again' : 'too short to analyse',
      false,
    );
    nagTimer = setTimeout(showZoom, 1600);
    syncButtons();
    return;
  }

  show(result);
}

function toggleRecording(pressedAt) {
  if (recording()) {
    stopRecording(pressedAt);
  } else {
    startRecording(pressedAt);
  }

  syncButtons();
}

// Put a recording on screen, whether it came from the mic or a file, and
// analyse it at the full view. Nothing here blocks: the pool does the work and
// this returns to the event loop immediately.
function show(result) {
  stopPlaying();
  hideInspect();

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
  // spinner beside it says the picture is on its way.
  showZoom();
  syncButtons();

  return track(
    analyze(canvas, rec, viewport, true).then(() => {
      draw(canvas, viewport);
      showZoom();
    }),
  );
}

// Decoded at a fixed rate rather than the device's, so a file gives the same
// samples — and the same picture — on every machine. Channels are averaged to
// mono, and anything past the length a take can be is left out.
const DECODE_RATE = 48000;

async function loadAudio(data, name) {
  if (recording()) {
    setStatus('stop recording first', false);
    nagTimer = setTimeout(showZoom, 1600);
    return;
  }

  setStatus(`opening ${name}…`, false);

  let decoded;

  try {
    decoded = await new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(
      data,
    );
  } catch (err) {
    setStatus(
      `could not read ${name}: ${err.message || 'unknown format'}`,
      false,
    );
    return;
  }

  const total = decoded.length;
  const n = Math.min(total, Math.round(RING_SECONDS * decoded.sampleRate));
  const samples = new Float32Array(n);

  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const ch = decoded.getChannelData(c);

    for (let i = 0; i < n; i++) {
      samples[i] += ch[i] / decoded.numberOfChannels;
    }
  }

  if (n < MIN_SAMPLES) {
    setStatus(`${name} is too short to analyse`, false);
    return;
  }

  fadeEnds(samples, decoded.sampleRate);

  const done = show({samples, sampleRate: decoded.sampleRate, name});

  if (n < total) {
    setStatus(
      `${name}: showing the first ${RING_SECONDS} s of ${(total / decoded.sampleRate).toFixed(0)} s`,
      false,
    );
    nagTimer = setTimeout(showZoom, 4000);
  }

  return done;
}

async function loadUrl(url) {
  const res = await fetch(url);

  if (!res.ok) {
    setStatus(`could not fetch ${url}: ${res.status}`, false);
    return;
  }

  return loadAudio(await res.arrayBuffer(), url.split('/').pop());
}

function loadFile(file) {
  return file.arrayBuffer().then((buf) => loadAudio(buf, file.name));
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
  if (saving || !rec) return;
  saving = true;
  syncButtons();

  try {
    // Exporting a cloud that is about to be replaced would write out the
    // coarser of the two pictures, and swapping mid-export would tear it.
    if (analysing) {
      setStatus('saving… waiting for the analysis', false);
      await analysing;
    }

    const image = await exportImage(canvas, rec, viewport, (done, total) =>
      setStatus(`saving… ${Math.round((100 * done) / total)}%`, false),
    );

    // No cloud to draw — the analysis failed — so a save would be a black
    // rectangle the size of a wall.
    if (!image) {
      setStatus('nothing to save — the analysis did not finish', false);
      nagTimer = setTimeout(showZoom, 2400);
      return;
    }

    const {blob, W, H} = image;
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
    syncButtons();
    draw(canvas, viewport);
  }
}

attachGestures(canvas, {
  getView: () => viewport,
  setView: (v) => {
    viewport = v;
  },
  getLimits: () => limits,
  onGesture: () => {
    if (!rec) return;
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
  canPan,
});

// A tap on the picture reads it. A press that moves past this many pixels is
// a pan, and one that ever has a second finger with it is a pinch; neither is
// a tap. The press itself does nothing, so there is nothing to undo.
const TAP_SLOP = 8;

let tap = null;

canvas.addEventListener('pointerdown', (e) => {
  hideInspect();

  tap = tap
    ? {...tap, multi: true}
    : {id: e.pointerId, x: e.clientX, y: e.clientY};
});

window.addEventListener('pointermove', (e) => {
  if (
    tap &&
    e.pointerId === tap.id &&
    Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP
  ) {
    tap.moved = true;
  }
});

window.addEventListener('pointerup', (e) => {
  if (!tap || e.pointerId !== tap.id) return;

  const was = tap;
  tap = null;

  if (!was.moved && !was.multi) {
    inspect(e.clientX, e.clientY);
  }
});

window.addEventListener('pointercancel', () => {
  tap = null;
});

// The buttons. A press is timed from pointerdown — that is when the click is
// heard — so the take ends before it rather than after it. Taking the press
// also keeps the button from holding focus, where Space would press it again.
let recDownAt = 0;

recBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  recDownAt = e.timeStamp;
});

recBtn.addEventListener('click', (e) =>
  toggleRecording(e.detail ? recDownAt : e.timeStamp),
);

for (const btn of [openBtn, playBtn, saveBtn]) {
  btn.addEventListener('pointerdown', (e) => e.preventDefault());
}

openBtn.addEventListener('click', () => fileInput.click());
playBtn.addEventListener('click', togglePlay);
saveBtn.addEventListener('click', save);

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';

  if (file) loadFile(file);
});

// Drop a file anywhere on the window.
window.addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  document.body.classList.add('dropping');
});

window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dropping');
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dropping');

  const file = e.dataTransfer.files[0];

  if (file) loadFile(file);
});

window.addEventListener('keydown', (e) => {
  // A focused button already answers Space and Enter itself.
  if (
    e.target instanceof HTMLButtonElement &&
    (e.code === 'Space' || e.code === 'Enter')
  ) {
    return;
  }

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

  // Cmd+S and Cmd+P belong to the browser. Taking them as well would export
  // behind a Save Page dialog, or start playback behind a Print one.
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

  if (e.code === 'KeyR') {
    toggleRecording(e.timeStamp);
  } else if (e.code === 'KeyO') {
    fileInput.click();
  } else if (e.code === 'KeyS') {
    save();
  } else if (e.code === 'KeyP' || e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  }
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

syncButtons();

// Everything a test needs to drive the page and score it — see `probe.js`.
// Viewports are in seconds and hertz, and every call resolves once the
// analysis it started has landed.
async function idle() {
  while (analysing) {
    await analysing;
  }
}

function setView(v) {
  viewport = v;
  requestFrame();
  track(
    analyze(canvas, rec, viewport, false).then(() => {
      draw(canvas, viewport);
      showZoom();
    }),
  );
  return idle();
}

window.soundViz = {
  load: (url) => loadUrl(url).then(idle),
  idle,

  // An exact viewport, {t0, t1} in seconds and {f0, f1} in Hz.
  view: ({t0, t1, f0, f1}) =>
    setView({t0: t0 * rec.sampleRate, t1: t1 * rec.sampleRate, f0, f1}),

  // Centred on (t seconds, f Hz), `zoom` times narrower than the full view in
  // both time and log-frequency — what that many notches of scrolling gives.
  zoomTo: ({t, f, zoom}) => {
    const span = (limits.tMax - limits.tMin) / zoom;
    const ratio = (limits.fMax / limits.fMin) ** (1 / zoom);
    const at = t * rec.sampleRate;

    return setView({
      t0: at - span / 2,
      t1: at + span / 2,
      f0: f / Math.sqrt(ratio),
      f1: f * Math.sqrt(ratio),
    });
  },

  measure: () =>
    measure({
      rec,
      viewport,
      readAccum: () => readAccum(canvas, viewport),
      snapshot: () => snapshot(canvas, viewport),
      status: () => status.textContent,
    }),
};

// `?file=signals/chirp.wav` opens a file on load — a test signal, usually,
// so a browser driver needs no microphone.
const startFile = new URLSearchParams(location.search).get('file');

if (startFile && accelerated) {
  loadUrl(startFile);
}
