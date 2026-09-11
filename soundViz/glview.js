// GPU renderer for the reassigned cell cloud.
//
// The cloud is several clouds — one per window length the sound was analysed
// at — laid end to end in one buffer and drawn one after another into the same
// accumulation. They are not alternatives to choose between: `ridge.js` has
// already divided the energy between them, so what they sum to is one picture
// carrying one recording's worth of power, sharp in time where a short window
// earned it and sharp in frequency where a long one did.
//
// The cloud is analysed once, for the whole recording, and then lives in GPU
// memory. Changing the viewport is a matter of new uniforms, so panning and
// zooming re-project exact positions at animation rate — and, crucially, show
// the *same picture* every time, because nothing is recomputed. What you zoom
// into is a crop of one fixed image, not a fresh analysis of the same sound.
//
// Three passes: accumulate every cell as a short stroke lying along its own
// ridge, blended additively into a float buffer; read a small point-sampled
// copy back so the CPU can measure the background level of each band; then dB,
// background subtraction and colour ramp to the screen.
//
// The background measurement happens once, over the whole recording, and is
// then frozen. It used to be redone for every viewport, which is what made the
// colours lurch on zoom: the estimator asks "how faint is the faint end of what
// is on screen", and at 100x the answer has nothing to do with the recording's
// actual noise floor.

// One cell is a vec4 instance attribute (t, f, power, angle) plus a float
// (coherence), drawn as a two-triangle strip. Sprites would be simpler, but a
// sprite is square, so a long stroke costs the fill of its whole bounding box
// and is thrown away entirely once its centre leaves the viewport. A quad
// costs its own area, clips instead of vanishing, and has no size ceiling —
// which is what lets a stroke be as long as the gap it has to bridge, however
// deep the zoom.
const CELL_FLOATS = 5;

// Background is measured from a point-sampled copy this size. The level of a
// band varies slowly, so a few hundred samples per axis is plenty.
const PROBE = 384;

const BACKGROUND_PERCENTILE = 5;

// The colour ramp spans this much above the background at most.
const MIN_RANGE = 12;

// A band with fewer sampled pixels than this has no usable level of its own.
const MIN_SAMPLED = 8;
const CONTRAST_RANGE = 36;

// Where the ramp stops being linear in dB, as a fraction of the range above the
// background. Above it the remaining dB are rolled off into the top of the ramp
// instead of being clipped against it.
//
// The range has to stay near 36 dB or the faint end sinks into the black fade,
// but a recording carries far more than that: measured over a loud take, the
// energy above the background ran to +65.7 dB, and 11.9% of every lit pixel sat
// at or above the +36 dB the ramp ended at. All of it drew as the same flat
// white — and white is also where hue and saturation stop meaning anything,
// since rotating a grey about the grey axis returns it unchanged, so the
// loudest parts of the picture were the parts that showed the least.
//
// Below the knee nothing moves at all: the curve is the same line with the same
// slope, so the faint end and the midtones are untouched. Above it the ramp
// approaches white without reaching it, which is what gives the top back its
// gradient and its colour. The two pieces meet with the same value and the same
// slope, so there is no visible seam at the knee.
const SHOULDER_KNEE = 0.6;

// Geometric dilution, and the compensation for it.
//
// A partial's energy is a *density*, so its peak brightness falls as the
// picture is zoomed into: at the full view its whole main lobe lands on one row
// of pixels and sums, and at 92x that lobe is resolved across a hundred rows.
// The exposure is measured once at the full view and then frozen — deliberately,
// and `CLAUDE.md` says why — so nothing used to take the slide back out, and
// this is why detail could seem to *disappear* as you zoomed in.
//
// The slide is a clean power law in the frequency magnification, and it was
// measured twice on different sources before being believed:
//
//   9 points to 68x, harmonic stack   peak proportional to zoomF^-0.443, R2 0.936
//   5 points to 92x, the older take   peak proportional to zoomF^-0.482, R2 0.950
//
// Both land on a half, so the compensation is a square root and not a fitted
// decimal: **a partial's peak dims as the square root of the frequency zoom.**
// Residuals against a clean 0.5 are inside 1.3 dB everywhere over 1-68x, which
// is well under what the ramp can express.
//
// What this is not: it is not the background being re-measured. `uLift` is a
// function of the viewport alone, computed against the span the background was
// measured over, so the exposure stays a property of the recording exactly as
// before and the full view is untouched (zoomF = 1, lift = 0 dB).
//
// It lifts noise along with signal, which is the honest cost — but measured, it
// does not wash the picture out, because the dust dilutes *faster* than the
// ridges do. Over the same sweep the peak slid 8.7 dB while the median of the
// whole picture slid 14.7 dB, so restoring the peak still leaves the floor 6 dB
// below where it sat at the full view. The peak-to-median gap widens with zoom
// on its own, 33.3 dB at 1x against 39.4 dB at 68x; this only puts the absolute
// level back.
const DILUTION_GAIN = 0.5;
const ABS_FLOOR = -80;
const QUIET_HEADROOM = 25;
const LEVEL_SIGMA = 7;
const DEAD_DB = -200;

// Stroke half-length stops, in device pixels. The lower one keeps a dense cloud
// drawing as points rather than smeared. The upper one exists only to bound the
// cost of filling one enormously stretched quad — at the bottom of a log axis,
// deep into a zoom, a single bin can span a screen height many times over.
const MIN_HALF = 0.6;
const MAX_HALF_SCREENS = 3;

// The ramp at a stroke's edges is one *screen* pixel wide, measured along each
// axis of the stroke's own frame — which is what `fwidth` in the fragment
// shader reports. It is not a softness setting, and softening it is not free:
//
// A ramp of exactly one pixel is the antialiased edge, and it is also the only
// profile whose samples on the pixel lattice sum to the same total wherever the
// stroke happens to fall, and whose butted copies sum flat along a ridge. A
// smoothstep taper was used here before, and cost both:
//
//   - a chain of touching strokes rippled 53% / 117% / 131% between the middle
//     of a stroke and the join at gaps of 3.6 / 6.8 / 13.2 px — the measured
//     cell spacings at 30x / 92x / 221x. The taper takes light *out* of the
//     ends, so butted strokes go dark exactly where they meet, and a filament
//     reads as a dotted line rather than a strand.
//   - the same chain came to 0.82-0.94 of the power it carried, varying with
//     the gap and so with the zoom, against 1.000 for the ramp.
//   - a point-like stroke (`MIN_HALF`, which is every cell at the full view and
//     every incoherent cell anywhere) deposited 20.4% more light at one
//     subpixel position than another. That is per-cell, uncorrelated between
//     neighbours, and it is the speckle a dense field shows.
//
// Normalising by `fwidth` rather than assuming 1.0 is what makes it hold at an
// angle: measured over 0-45 degrees the worst per-stroke spread is 8.6% against
// 20.4%, and for anything longer than a couple of pixels it is under 1.5%.
// 2x2 supersampling on top of this would take that last 8.6% to 2.2%, for
// three to four times the accumulate pass — 164 ms at the full view, measured,
// so half a second a frame. Not worth it; the profile was the whole problem.

// How the coherence channel shows. Hue is rotated by at most HUE_GAIN radians
// at the extremes of chirp direction — rising sweeps lean one way round the
// colour wheel, falling sweeps the other — and incoherent energy is pulled
// towards its own grey. Both are deliberately mild: amplitude must stay the
// thing the colour reads as, or the ramp's lesson is lost.
//
// The chirp rate cannot drive hue directly: audible sweeps run from tens to
// thousands of Hz per second, so any linear mapping wastes the range on one
// end. Instead the rate is pushed through two soft resonances, each peaking
// where sin(2·atan(q/Q)) peaks — one at a speech-glide sort of rate, one at a
// fast-sweep rate — so the whole audible spread of sweeps picks up tint while
// steady tones (q ≈ 0) and clicks (q → ∞) stay on the ramp's own colours.
const HUE_GAIN = 0.7;
const HUE_Q1 = 200; // Hz/s
const HUE_Q2 = 6000; // Hz/s
const SAT_FLOOR = 0.35;

// The colour ramp. The stops climb monotonically in brightness, which matters
// more than it sounds: MATLAB's "jet" runs bright at cyan, dim at blue-green
// and bright again at yellow, so a filament of constant strength appears to
// break into beads as it crosses the ramp.
const STOPS = [
  [0.0, 0, 0, 0],
  [0.1, 2, 7, 24],
  [0.24, 7, 30, 82],
  [0.4, 0, 100, 180],
  [0.56, 0, 195, 185],
  [0.72, 35, 220, 105],
  [0.87, 215, 225, 45],
  [1.0, 255, 255, 255],
];

// The bottom of the ramp bends towards black, so the noise floor sinks away
// instead of sitting there as a flat wash of navy.
const BLACK_FADE = 0.11;
const LUT_SIZE = 256;

function buildLut() {
  const lut = new Uint8Array(LUT_SIZE * 4);

  for (let i = 0; i < LUT_SIZE; i++) {
    let t = i / (LUT_SIZE - 1);

    if (t < BLACK_FADE) {
      const x = t / BLACK_FADE;
      t = BLACK_FADE * x * x;
    }

    let lo = STOPS[0];
    let hi = STOPS[STOPS.length - 1];

    for (let k = 1; k < STOPS.length; k++) {
      if (t <= STOPS[k][0]) {
        lo = STOPS[k - 1];
        hi = STOPS[k];
        break;
      }
    }

    const span = hi[0] - lo[0];
    const p = span > 0 ? (t - lo[0]) / span : 0;

    lut[i * 4] = lo[1] + (hi[1] - lo[1]) * p;
    lut[i * 4 + 1] = lo[2] + (hi[2] - lo[2]) * p;
    lut[i * 4 + 2] = lo[3] + (hi[3] - lo[3]) * p;
    lut[i * 4 + 3] = 255;
  }

  return lut;
}

const ACCUM_VS = `#version 300 es
in vec2 corner;               // (along, across), each -1 or +1
in vec4 cell;                 // t (samples), f (Hz), power, ridge angle
in float conf;                // coherence, 0..1

uniform vec2  uT;             // viewport time span, samples
uniform vec2  uLogF;          // viewport log-frequency span
uniform vec2  uSize;          // target size, px
uniform float uHop;           // analysis hop, samples
uniform float uBinHz;         // analysis bin spacing, Hz
uniform float uMaxHalf;       // longest half-stroke, px
uniform float uSr;            // sample rate, Hz

out float vPower;
out float vAlong;
out float vAcross;
out float vHalf;
out float vWidth;
out float vConf;
out float vDrive;

// sin(2·atan(q/Q)) without the atan, safe at q = 0 and q = ∞.
float lobe(float sinA, float cosA, float qScale) {
  float x = sinA * qScale;
  return 2.0 * x * cosA / (cosA * cosA + x * x + 1e-12);
}

void main() {
  float t = cell.x;
  float f = cell.y;

  float tSpan = uT.y - uT.x;
  float lSpan = uLogF.y - uLogF.x;

  vec2 at = vec2((t - uT.x) / tSpan * uSize.x,
                 (1.0 - (log(f) - uLogF.x) / lSpan) * uSize.y);

  // The stored angle encodes rise in Hz against run in samples. Mapping each
  // through its own axis scale turns it into a direction in pixels; the axes
  // have wildly different units, so the length is meaningless and only the
  // direction survives normalisation.
  float run  = cos(cell.w);
  float rise = sin(cell.w);

  vec2 d = vec2( run  * uSize.x / tSpan,
                -rise * uSize.y / (lSpan * f) );

  float len = length(d);
  vec2 dir = len > 0.0 ? d / len : vec2(1.0, 0.0);

  // How far apart neighbouring cells land on screen right now. Along a ridge
  // that runs in time the next cell is one hop later; along one that stands up
  // in frequency it is one bin higher. Both grow as the viewport tightens, so
  // making the stroke span that gap is what keeps a ridge continuous at any
  // zoom without analysing anything again — and the direction it is drawn along
  // was measured from the signal, so the interpolation follows the ridge rather
  // than guessing at it.
  float gapT = uHop * uSize.x / tSpan;
  float gapF = uBinHz * uSize.y / (lSpan * f);
  float gap  = abs(dir.x) * gapT + abs(dir.y) * gapF;

  // Only a trustworthy direction earns the length to bridge the gap to its
  // neighbour. Where the direction estimate is corroborated by nothing — noise,
  // or two components fighting over one window — elongating the stroke is what
  // used to draw the spaghetti, so an incoherent cell stays a point. And deep
  // into a zoom, where the gap runs to dozens of pixels, only a near-perfect
  // direction may draw a genuinely long stroke: a middling one drawn that long
  // is a comb tooth lying across the curve the eye follows, so its length is
  // capped instead. Both are drawing decisions — length never meant anything
  // about the signal.
  float bridge = smoothstep(0.15, 0.6, conf);

  // Geometric, not linear: the cap has to pass through the scales that matter
  // (a few px, tens of px) on its way to the cost bound, or middling cells get
  // an effectively unbounded stroke the moment they clear the gate.
  float longCap = 3.0 * pow(max(uMaxHalf, 3.0) / 3.0, pow(conf, 8.0));

  vHalf = clamp(0.5 * gap * bridge, ${MIN_HALF.toFixed(2)}, min(longCap, uMaxHalf));

  // How many strokes stack on one pixel of a ridge: several when the cloud is
  // denser than the screen, exactly one once the strokes are merely touching.
  // Dividing that out is what holds a ridge at one brightness right across the
  // zoom range, whichever way it runs. The numerator is the integral of the
  // fragment shader's end profile, so the two stay in step — and a one-pixel
  // ramp integrates to exactly 2*vHalf however wide the ramp turns out to be,
  // which is why there is no longer a fudge term here to keep in step with.
  //
  // Only ever a division, never a multiplication: past the point where the
  // strokes stop touching, scaling *up* what is left would make a ridge
  // brighten as it falls apart, which is the opposite of the truth.
  float coverage = max(2.0 * vHalf / max(gap, 1e-3), 1.0);

  // Coherent strokes draw a shade wider than dust, so strong structure reads
  // crisp while the ambiguous residue stays fine-grained.
  vWidth = mix(1.25, 1.6, conf);

  vPower  = cell.z / coverage;

  // Half a pixel of slack past where each profile reaches zero, so the ramp is
  // never cut off by the quad's own edge. At 45 degrees a one-pixel screen ramp
  // is sqrt(2) long in the stroke's frame, which is what sets the margins.
  vAlong  = corner.x * (vHalf + 1.0);
  vAcross = corner.y * (vWidth + 0.5);
  vConf   = conf;

  // The chirp-rate hue drive, in -1..1: positive for rising sweeps, negative
  // for falling, zero for steady tones and clicks. tan(cell.w) is the chirp
  // rate in Hz per sample; both lobes flip sign with it, and the axial
  // ambiguity of the stored direction cancels in the sin·cos product.
  float sinA = sin(cell.w);
  float cosA = cos(cell.w);
  vDrive = 0.5 * (lobe(sinA, cosA, uSr / ${HUE_Q1.toFixed(1)})
                + lobe(sinA, cosA, uSr / ${HUE_Q2.toFixed(1)}));

  vec2 p = at + dir * vAlong + vec2(-dir.y, dir.x) * vAcross;

  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
}`;

const ACCUM_FS = `#version 300 es
precision highp float;

in float vPower;
in float vAlong;
in float vAcross;
in float vHalf;
in float vWidth;
in float vConf;
in float vDrive;

out vec4 frag;

void main() {
  // One screen pixel, measured along each axis of the stroke's own frame.
  // Both varyings are linear in screen space, so these are exact: 1.0 for a
  // stroke lying along an axis, sqrt(2) for one at 45 degrees. Dividing by them
  // is what keeps the ramp one pixel wide on screen at every angle, and a
  // one-pixel ramp is both the antialiased edge and the only profile that
  // deposits the same light wherever the stroke lands on the pixel grid.
  float fAlong  = fwidth(vAlong);
  float fAcross = fwidth(vAcross);

  float ends      = clamp((vHalf + 0.5 * fAlong - abs(vAlong)) / fAlong,
                          0.0, 1.0);

  // The half-value point stays at vWidth - 0.5, exactly where the old profile
  // put it, so a stroke covers the same area and carries the same power.
  float thickness = clamp((vWidth - 0.5 + 0.5 * fAcross - abs(vAcross)) / fAcross,
                          0.0, 1.0);

  float p = vPower * ends * thickness;

  // Alongside the power, energy-weighted hue drive and coherence, so the
  // present pass can recover a mean sweep direction and a mean confidence per
  // pixel. The drive is weighted by coherence too: dust has no business
  // voting on the hue of a ridge it happens to cross.
  float pc = p * vConf;

  frag = vec4(p, pc * vDrive, 0.0, pc);
}`;

const QUAD_VS = `#version 300 es
in vec2 pos;
out vec2 uv;
void main() {
  uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const DECIMATE_FS = `#version 300 es
precision highp float;
uniform highp sampler2D uAccum;
uniform vec2 uInner;
in vec2 uv;
out vec4 frag;
void main() {
  // Point-sampled, never averaged: a percentile of averages is not the
  // percentile we are after.
  ivec2 at = ivec2(floor(uv * uInner));
  frag = vec4(texelFetch(uAccum, at, 0).r, 0.0, 0.0, 1.0);
}`;

// One texel of the accumulation buffer, verbatim. Routed through its own
// RGBA32F target rather than read back directly, because the accumulation
// buffer itself may be RGBA16F (`canBlend32` false) and reading a half-float
// framebuffer as FLOAT is not something every implementation is asked to
// support.
const PICK_FS = `#version 300 es
precision highp float;
uniform highp sampler2D uAccum;
uniform ivec2 uAt;
out vec4 frag;
void main() {
  frag = texelFetch(uAccum, uAt, 0);
}`;

const PRESENT_FS = `#version 300 es
precision highp float;

uniform highp sampler2D uAccum;
uniform sampler2D uLut;
uniform highp sampler2D uBackground;   // one row: level in dB against log f

uniform vec2  uInner;
uniform vec2  uLogF;      // viewport log-frequency span
uniform vec2  uBgLogF;    // span the background was measured over
uniform float uFloorDb;
uniform float uRange;
uniform float uLift;      // dB, undoing this viewport's geometric dilution

in vec2 uv;
out vec4 frag;

// Rotation about the grey axis. Small angles only, so luminance barely moves
// and the ramp keeps its monotonic-brightness promise.
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735026919);
  float cs = cos(a);
  return c * cs + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cs);
}

void main() {
  vec4 acc = texelFetch(uAccum, ivec2(uv * uInner), 0);
  float power = acc.r;
  float db = power > 0.0 ? 10.0 * log(power) / log(10.0) : ${DEAD_DB}.0;

  // Look the background up by absolute frequency, so it stays put under the
  // picture while the viewport moves over it.
  float logF = uLogF.x + uv.y * (uLogF.y - uLogF.x);
  float s = clamp((logF - uBgLogF.x) / (uBgLogF.y - uBgLogF.x), 0.0, 1.0);
  float base = max(texture(uBackground, vec2(s, 0.5)).r, uFloorDb);

  // Linear in dB up to the knee, then a soft shoulder that compresses whatever
  // is left into the top of the ramp rather than clipping it flat against it.
  float x = max(db + uLift - base, 0.0) / uRange;
  const float knee = ${SHOULDER_KNEE.toFixed(2)};
  float intensity = x < knee
    ? x
    : 1.0 - (1.0 - knee) * exp(-(x - knee) / (1.0 - knee));

  vec3 rgb = texture(uLut, vec2(intensity, 0.5)).rgb;

  if (power > 0.0) {
    // Brightness is amplitude and nothing else; the two extra channels bend
    // only hue and saturation. Mean coherence of the energy here, and the mean
    // sweep drive of its coherent part: rising sweeps lean the hue one way,
    // falling sweeps the other, and energy nothing corroborates greys out
    // rather than posing as structure.
    float conf = clamp(acc.a / power, 0.0, 1.0);
    float drive = clamp(acc.g / max(acc.a, 1e-20), -1.0, 1.0);

    rgb = hueRotate(rgb, ${HUE_GAIN.toFixed(2)} * drive * conf);

    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3(luma), rgb, mix(${SAT_FLOOR.toFixed(2)}, 1.0, conf));
  }

  frag = vec4(rgb, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);

  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh));
  }

  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);

  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }

  return p;
}

function target(gl, w, h, internal, format, type) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );

  const ok =
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return ok ? {tex, fbo, w, h} : null;
}

export function createView(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false,
  });

  if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
    return null;
  }

  // Blending into a 32-bit float target is a further extension again. Half
  // floats still carry the exponent range this needs; only the mantissa is
  // shorter, and within one band the cells being summed are alike in size.
  const canBlend32 = !!gl.getExtension('EXT_float_blend');
  const bgFilter = gl.getExtension('OES_texture_float_linear')
    ? gl.LINEAR
    : gl.NEAREST;

  const accumProg = program(gl, ACCUM_VS, ACCUM_FS);
  const decimateProg = program(gl, QUAD_VS, DECIMATE_FS);
  const presentProg = program(gl, QUAD_VS, PRESENT_FS);
  const pickProg = program(gl, QUAD_VS, PICK_FS);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  const cloud = gl.createBuffer();

  // (along, across) signs for the two triangles of a stroke.
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const lut = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lut);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    LUT_SIZE,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    buildLut(),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const bgTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bgTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, bgFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, bgFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const probe = target(gl, PROBE, PROBE, gl.RGBA32F, gl.RGBA, gl.FLOAT);
  const pick = target(gl, 1, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT);

  if (!probe || !pick) {
    return null;
  }

  const probePixels = new Float32Array(PROBE * PROBE * 4);
  const pickPixel = new Float32Array(4);
  const level = new Float32Array(PROBE);
  const smoothed = new Float32Array(PROBE);
  const row = new Float32Array(PROBE);

  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  let accum = null;
  let inner = [0, 0];

  // Stroke lengths are bounded against the height of the whole image, not of
  // the buffer in hand, so an export tile draws exactly what the screen would.
  let imageHeight = 1;

  let analysis = null;
  let bgLogF = [0, 1];
  let floorDb = ABS_FLOOR;
  let range = CONTRAST_RANGE;

  function ensureAccum(w, h) {
    inner = [w, h];

    if (accum && accum.w === w && accum.h === h) {
      return true;
    }

    accumFor = null;

    if (accum) {
      gl.deleteTexture(accum.tex);
      gl.deleteFramebuffer(accum.fbo);
    }

    accum = canBlend32
      ? target(gl, w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT)
      : target(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);

    return !!accum;
  }

  function fullScreen(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const loc = gl.getAttribLocation(prog, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Which stretches of the buffer hold the cells that can reach this viewport.
  // Cells come out of the analysis in frame order and a frame's cells all lie
  // within half a window of its centre, so the visible frames are a contiguous
  // run — which is what makes it affordable to hold a cloud far larger than any
  // one view of it needs.
  //
  // One run per region of one scale, not one overall. The pass is several
  // window lengths, each cut into regions and analysed by a pool of threads,
  // and each region writes into the stretch its frames would fill at their
  // widest — so the buffer has a gap wherever a region emitted fewer cells than
  // it reserved. Regions are in frame order and there are at most a couple of
  // dozen per scale, so this is a handful of draw calls rather than one, and
  // the gaps are never touched.
  function slice(view, sc, out) {
    out.length = 0;

    const {starts, regions, hop, winLen, frames, tStart} = sc;
    const reach = winLen / 2 + hop;

    const lo = Math.max(
      0,
      Math.min(frames, Math.floor((view.t0 - reach - tStart) / hop)),
    );
    const hi = Math.max(
      lo,
      Math.min(frames, Math.ceil((view.t1 + reach - tStart) / hop)),
    );

    for (const r of regions) {
      const a = Math.max(lo, r.f0);
      const b = Math.min(hi, r.f1);

      if (a >= b) {
        continue;
      }

      // `starts` holds where each frame begins. One past the last frame of a
      // region is the next region's base, not this one's end, so the region
      // carries its own end.
      const first = starts[a];
      const last = b < r.f1 ? starts[b] : r.end;

      if (last > first) {
        out.push(first, last - first);
      }
    }

    return out;
  }

  const ranges = [];

  // What the accumulation buffer already holds, if anything. The first analysis
  // of a recording draws the whole cloud twice over the same full view — once
  // to measure the exposure from it, once to show it — and at this size that is
  // most of a second of GPU time for a second copy of a picture already in
  // hand. Anything that changes what an accumulation would produce clears this:
  // a new cloud, a resize, an export tile.
  let accumFor = null;

  function accumulate(view) {
    if (
      accumFor &&
      accumFor.t0 === view.t0 &&
      accumFor.t1 === view.t1 &&
      accumFor.f0 === view.f0 &&
      accumFor.f1 === view.f1
    ) {
      return;
    }

    accumFor = {t0: view.t0, t1: view.t1, f0: view.f0, f1: view.f1};

    const l0 = Math.log(view.f0);
    const l1 = Math.log(view.f1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
    gl.viewport(0, 0, accum.w, accum.h);

    // Alpha accumulates coherence-weighted power, so it must start at zero.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(gl.FUNC_ADD);

    gl.useProgram(accumProg);
    gl.uniform2f(gl.getUniformLocation(accumProg, 'uT'), view.t0, view.t1);
    gl.uniform2f(gl.getUniformLocation(accumProg, 'uLogF'), l0, l1);
    gl.uniform2f(gl.getUniformLocation(accumProg, 'uSize'), accum.w, accum.h);
    gl.uniform1f(
      gl.getUniformLocation(accumProg, 'uMaxHalf'),
      MAX_HALF_SCREENS * imageHeight,
    );
    gl.uniform1f(gl.getUniformLocation(accumProg, 'uSr'), analysis.sampleRate);

    const hopLoc = gl.getUniformLocation(accumProg, 'uHop');
    const binHzLoc = gl.getUniformLocation(accumProg, 'uBinHz');

    const cornerLoc = gl.getAttribLocation(accumProg, 'corner');
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(cornerLoc);
    gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(cornerLoc, 0);

    const stride = CELL_FLOATS * 4;

    const cellLoc = gl.getAttribLocation(accumProg, 'cell');
    const confLoc = gl.getAttribLocation(accumProg, 'conf');
    gl.bindBuffer(gl.ARRAY_BUFFER, cloud);
    gl.enableVertexAttribArray(cellLoc);
    gl.vertexAttribDivisor(cellLoc, 1);
    gl.enableVertexAttribArray(confLoc);
    gl.vertexAttribDivisor(confLoc, 1);

    // The scales are laid end to end in one buffer but each was sampled on a
    // grid of its own, and the stroke length a cell earns is the gap to where
    // its neighbour fell — so the hop and the bin spacing change between them.
    // Two uniforms per scale is the whole of the cost.
    for (const sc of analysis.scales) {
      gl.uniform1f(hopLoc, sc.hop);
      gl.uniform1f(binHzLoc, sc.binHz);

      slice(view, sc, ranges);

      for (let i = 0; i < ranges.length; i += 2) {
        const base = ranges[i] * stride;

        gl.vertexAttribPointer(cellLoc, 4, gl.FLOAT, false, stride, base);
        gl.vertexAttribPointer(confLoc, 1, gl.FLOAT, false, stride, base + 16);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, ranges[i + 1]);
      }
    }

    gl.vertexAttribDivisor(cellLoc, 0);
    gl.disableVertexAttribArray(cellLoc);
    gl.vertexAttribDivisor(confLoc, 0);
    gl.disableVertexAttribArray(confLoc);
  }

  function measureBackground(view) {
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, probe.fbo);
    gl.viewport(0, 0, PROBE, PROBE);
    gl.useProgram(decimateProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accum.tex);
    gl.uniform1i(gl.getUniformLocation(decimateProg, 'uAccum'), 0);
    gl.uniform2f(
      gl.getUniformLocation(decimateProg, 'uInner'),
      inner[0],
      inner[1],
    );
    fullScreen(decimateProg);

    gl.readPixels(0, 0, PROBE, PROBE, gl.RGBA, gl.FLOAT, probePixels);

    let peak = DEAD_DB;

    // Row 0 of a framebuffer is its bottom row, which here is the lowest
    // frequency — the same direction the shader looks the background up in.
    //
    // Only pixels that actually received something count towards the level. An
    // empty pixel is not a quiet one: much of a picture is simply unsampled,
    // and letting those count drags the estimate down to the floor, whereupon
    // everything still drawn reads as full brightness.
    for (let r = 0; r < PROBE; r++) {
      const at = r * PROBE * 4;

      let m = 0;

      for (let c = 0; c < PROBE; c++) {
        const v = probePixels[at + c * 4];

        if (v > 0) {
          row[m++] = 10 * Math.log10(v);
        }
      }

      if (m < MIN_SAMPLED) {
        level[r] = DEAD_DB;
        continue;
      }

      const seen = row.subarray(0, m);
      seen.sort();
      level[r] = seen[Math.round((m - 1) * (BACKGROUND_PERCENTILE / 100))];

      // The bright end of this band. A percentile rather than the maximum: one
      // stray cell should not decide the exposure of the whole picture.
      const bright = seen[Math.round((m - 1) * 0.99)];

      if (bright > peak) {
        peak = bright;
      }
    }

    // Bands with nothing in them borrow the nearest measured level, so the
    // smoothing below is not dragged towards the floor by empty neighbours.
    let last = DEAD_DB;

    for (let r = 0; r < PROBE; r++) {
      if (level[r] > DEAD_DB) {
        last = level[r];
      } else if (last > DEAD_DB) {
        level[r] = last;
      }
    }

    for (let r = PROBE - 1; r >= 0; r--) {
      if (level[r] > DEAD_DB) {
        last = level[r];
      } else if (last > DEAD_DB) {
        level[r] = last;
      }
    }

    // A per-band estimate is noisy, and a band that lands a decibel low is
    // lifted a decibel brighter than its neighbours, which reads as banding.
    // The true background spectrum is smooth, so smooth it.
    const radius = Math.ceil(LEVEL_SIGMA * 3);
    const sigma2 = 2 * LEVEL_SIGMA * LEVEL_SIGMA;

    for (let r = 0; r < PROBE; r++) {
      let sum = 0;
      let weight = 0;

      for (
        let k = Math.max(0, r - radius);
        k <= Math.min(PROBE - 1, r + radius);
        k++
      ) {
        const g = Math.exp(-((k - r) * (k - r)) / sigma2);
        sum += level[k] * g;
        weight += g;
      }

      smoothed[r] = sum / weight;
    }

    // Absolute, not peak-relative: a recording of nothing has a tiny peak, and
    // scoring its own room tone against that peak fills the screen with
    // texture. The peak-relative term only rescues a genuinely quiet take.
    floorDb = Math.min(ABS_FLOOR, peak - QUIET_HEADROOM);
    bgLogF = [Math.log(view.f0), Math.log(view.f1)];

    // Typical background, against which the peak says how much range the
    // picture actually contains.
    const sorted = Float32Array.from(smoothed).sort();
    const mid = Math.max(sorted[PROBE >> 1], floorDb);

    range = Math.min(CONTRAST_RANGE, Math.max(MIN_RANGE, peak - mid));

    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      PROBE,
      1,
      0,
      gl.RED,
      gl.FLOAT,
      smoothed,
    );
  }

  // How far this viewport has diluted the picture, in dB, against the view the
  // background was measured over. Zero at the full view, and never negative:
  // there is nothing above the calibration span to zoom out to.
  function liftFor(view) {
    const span = Math.log(view.f1) - Math.log(view.f0);
    const zoomF = span > 0 ? (bgLogF[1] - bgLogF[0]) / span : 1;

    return zoomF > 1 ? DILUTION_GAIN * 10 * Math.log10(zoomF) : 0;
  }

  function present(view, fbo, w, h) {
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(presentProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accum.tex);
    gl.uniform1i(gl.getUniformLocation(presentProg, 'uAccum'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lut);
    gl.uniform1i(gl.getUniformLocation(presentProg, 'uLut'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.uniform1i(gl.getUniformLocation(presentProg, 'uBackground'), 2);

    gl.uniform2f(
      gl.getUniformLocation(presentProg, 'uInner'),
      inner[0],
      inner[1],
    );
    gl.uniform2f(
      gl.getUniformLocation(presentProg, 'uLogF'),
      Math.log(view.f0),
      Math.log(view.f1),
    );
    gl.uniform2f(
      gl.getUniformLocation(presentProg, 'uBgLogF'),
      bgLogF[0],
      bgLogF[1],
    );
    gl.uniform1f(gl.getUniformLocation(presentProg, 'uFloorDb'), floorDb);
    gl.uniform1f(gl.getUniformLocation(presentProg, 'uRange'), range);
    gl.uniform1f(gl.getUniformLocation(presentProg, 'uLift'), liftFor(view));

    fullScreen(presentProg);
  }

  return {
    maxTile: Math.min(maxTexture, 2048),

    resize(w, h) {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      if (imageHeight !== h) {
        accumFor = null;
      }

      imageHeight = h;

      return ensureAccum(w, h);
    },

    // Reserve room for the whole cloud, then take the finished regions of a
    // pass. Nothing is thinned and nothing is thrown away.
    //
    // `bufferData` runs every time even when the size has not changed, and
    // that is the point of it: it *orphans* the old storage, so the uploads
    // below get fresh memory instead of waiting for whatever draw calls are
    // still reading the buffer. Skipping it as an optimisation was tried and
    // was much worse — a pass landing in the middle of a drag, with sixty
    // frames' worth of draws queued against the same buffer, blocked the main
    // thread for 2.2 s instead of 65 ms. Allocating a gigabyte costs 0–180 ms
    // and only the first touch of it costs anything at all.
    begin(cells) {
      gl.bindBuffer(gl.ARRAY_BUFFER, cloud);
      gl.bufferData(gl.ARRAY_BUFFER, cells * CELL_FLOATS * 4, gl.STATIC_DRAW);

      analysis = null;
      accumFor = null;
    },

    // One region, at the cell offset it reserved for itself.
    pushAt(at, data, n) {
      gl.bindBuffer(gl.ARRAY_BUFFER, cloud);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        at * CELL_FLOATS * 4,
        data,
        0,
        n * CELL_FLOATS,
      );
    },

    end(params) {
      analysis = params;
      accumFor = null;
    },

    // Set the exposure from the whole recording, once. Everything after this is
    // a crop of the picture it describes, so nothing about the colours depends
    // on where you happen to be looking.
    calibrate(view) {
      if (!analysis) {
        return;
      }

      accumulate(view);
      measureBackground(view);
    },

    render(view) {
      if (!analysis) {
        return;
      }

      accumulate(view);
      present(view, null, canvas.width, canvas.height);
    },

    // Reads back exactly what the accumulation buffer holds for one screen
    // pixel — amplitude above the recording's own background, mean coherence,
    // mean sweep drive — the same three quantities the picture already encodes
    // as brightness, saturation and hue. Nothing is recomputed from the cloud;
    // this is what is on screen, in numbers. Routed through the dedicated 1x1
    // `pick` target rather than reading `accum` directly, because `accum` may
    // be RGBA16F (`canBlend32` false) and reading a half-float framebuffer back
    // as FLOAT is not something every implementation is asked to support.
    sampleCell(u, v, f) {
      if (!accum) {
        return null;
      }

      const x = Math.min(accum.w - 1, Math.max(0, Math.round(u * accum.w)));
      const y = Math.min(
        accum.h - 1,
        Math.max(0, Math.round((1 - v) * accum.h)),
      );

      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pick.fbo);
      gl.viewport(0, 0, 1, 1);
      gl.useProgram(pickProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, accum.tex);
      gl.uniform1i(gl.getUniformLocation(pickProg, 'uAccum'), 0);
      gl.uniform2i(gl.getUniformLocation(pickProg, 'uAt'), x, y);
      fullScreen(pickProg);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pickPixel);

      const [power, gSum, , aSum] = pickPixel;

      // Empty is not the same as quiet: nothing landed here at all.
      if (power <= 0) {
        return null;
      }

      const conf = Math.min(1, aSum / power);
      const drive = aSum > 0 ? Math.max(-1, Math.min(1, gSum / aSum)) : 0;

      // The same background lookup the present pass makes for this pixel, so
      // the number matches the brightness it actually drew at.
      const s = Math.min(
        1,
        Math.max(0, (Math.log(f) - bgLogF[0]) / (bgLogF[1] - bgLogF[0])),
      );
      const at = s * (PROBE - 1);
      const i0 = Math.floor(at);
      const i1 = Math.min(PROBE - 1, i0 + 1);
      const bg = Math.max(
        smoothed[i0] + (smoothed[i1] - smoothed[i0]) * (at - i0),
        floorDb,
      );

      // Plus this viewport's dilution lift, for the same reason the background
      // lookup above is shared with the present pass: the number has to be the
      // one the brightness on screen was drawn from.
      return {
        aboveBg:
          10 * Math.log10(power) - bg + (accumFor ? liftFor(accumFor) : 0),
        conf,
        drive,
      };
    },

    // One tile of a larger image, returned as RGBA rows top-first. Strokes are
    // clipped rather than dropped at a tile edge, and the exposure was fixed
    // before any of this, so tiles meet without a seam.
    tile(view, w, h, height, out) {
      // Stroke length depends on the height being drawn against, so a tile
      // never inherits the screen's accumulation and the screen never inherits
      // a tile's.
      accumFor = null;
      imageHeight = height;

      if (!analysis || !ensureAccum(w, h)) {
        return null;
      }

      const dest = target(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);

      if (!dest) {
        return null;
      }

      accumulate(view);
      present(view, dest.fbo, w, h);

      const raw = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);

      gl.deleteTexture(dest.tex);
      gl.deleteFramebuffer(dest.fbo);

      // readPixels hands back bottom row first.
      for (let r = 0; r < h; r++) {
        out.set(raw.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4);
      }

      return out;
    },

    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
  };
}
