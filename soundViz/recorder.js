// The mic is opened once and then left running, with audio flowing into a ring
// buffer. A "take" is just a pair of positions in that buffer. This matters:
// a freshly-opened capture stream spends ~200 ms delivering silence and a
// startup click before real audio arrives, which would otherwise land at the
// start of every recording.

const RING_SECONDS = 32;
const WARMUP_SEC = 0.25; // discarded after opening: silence + the startup click
const LEAD_TRIM = 0.15; // skipped after the press: the mouse/key click itself is audible
const IDLE_RELEASE_SEC = 60; // close the mic if unused this long, so its light goes out
const FADE_SEC = 0.004; // raised-cosine at each end of a take, see endTake

let audioCtx = null;
let workletLoaded = false;
let stream = null;
let source = null;
let node = null;

let ring = null;
let ringSize = 0;
let written = 0; // total samples ever written, past the warm-up
let warmupLeft = 0;
let idleTimer = null;

// True while the freshly-opened stream is still delivering its warm-up garbage,
// which is discarded rather than recorded. Worth showing: a take started now
// begins a moment later than the button did.
export function isArming() {
  return !!stream && warmupLeft > 0;
}

function push(chunk) {
  if (warmupLeft > 0) {
    const skip = Math.min(warmupLeft, chunk.length);
    warmupLeft -= skip;
    chunk = chunk.subarray(skip);
    if (!chunk.length) return;
  }
  if (chunk.length >= ringSize) chunk = chunk.subarray(chunk.length - ringSize);
  const at = written % ringSize;
  const firstRun = Math.min(chunk.length, ringSize - at);
  ring.set(chunk.subarray(0, firstRun), at);
  if (firstRun < chunk.length) ring.set(chunk.subarray(firstRun), 0);
  written += chunk.length;
}

export async function ensureMic() {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (stream) return;

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  if (!workletLoaded) {
    await audioCtx.audioWorklet.addModule('./capture-processor.js');
    workletLoaded = true;
  }

  ringSize = Math.round(audioCtx.sampleRate * RING_SECONDS);
  ring = new Float32Array(ringSize);
  written = 0;
  warmupLeft = Math.round(audioCtx.sampleRate * WARMUP_SEC);

  source = audioCtx.createMediaStreamSource(stream);
  node = new AudioWorkletNode(audioCtx, 'capture-processor');
  node.port.onmessage = (e) => push(e.data);
  source.connect(node);
  node.connect(audioCtx.destination); // Safari needs a sink; the node emits silence.
}

// The playback path needs somewhere to send audio, and this is the context the
// recording's sample rate belongs to — resampling a take just to play it back
// would put the picture and the sound on different clocks. Only ever called
// once a recording exists, so the context is always already open.
export function audioContext() {
  return audioCtx;
}

export function releaseMic() {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (!stream) return;
  node.port.onmessage = null;
  source.disconnect();
  node.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  stream = source = node = null;
}

// Where a take should start. On a warm mic this sits *ahead* of the current
// write position: pressing makes a noise, and capture latency means that noise
// has not been written yet when the event fires. On a mic that just opened the
// warm-up discard already covers the press, so trimming again would only eat
// into a first take that is short on audio as it is.
//
// `lagMs` is how long ago the button actually went down. Rendering runs on the
// main thread, so a press landing during one is not seen until it finishes —
// by which time the audio it was meant to start at is already in the ring.
// Reaching back by the lag recovers it instead of losing the whole take.
export function beginTake(lagMs = 0) {
  const back = Math.round((audioCtx.sampleRate * lagMs) / 1000);
  const lead = warmupLeft > 0 ? 0 : Math.round(audioCtx.sampleRate * LEAD_TRIM);

  return Math.max(0, written - back + lead);
}

export function endTake(from) {
  const start = Math.max(from, written - ringSize);
  const n = Math.max(0, written - start);
  const samples = new Float32Array(n);
  const at = start % ringSize;
  const firstRun = Math.min(n, ringSize - at);
  samples.set(ring.subarray(at, at + firstRun), 0);
  if (firstRun < n) samples.set(ring.subarray(0, n - firstRun), firstRun);

  // A hard cut at either end is a step, and a step is broadband: it drew a
  // bright vertical curtain down the edges of every recording. A few
  // milliseconds of raised cosine removes energy that was never in the sound.
  const fade = Math.min(Math.round(audioCtx.sampleRate * FADE_SEC), n >> 1);
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    samples[i] *= g;
    samples[n - 1 - i] *= g;
  }

  idleTimer = setTimeout(releaseMic, IDLE_RELEASE_SEC * 1000);
  return {samples, sampleRate: audioCtx.sampleRate};
}
