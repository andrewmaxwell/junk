import {FFT} from './fft.js';
import {REACH, SHARE_ROWS} from './ridge.js';

// Reassigned spectrogram, as a cloud of cells rather than a grid.
//
// Each cell is a scrap of energy that the phase of the STFT says belongs at a
// particular instant and a particular frequency — not at the centre of the bin
// it happened to land in. Alongside those two numbers we recover the direction
// the underlying ridge is travelling in, so a cell can be drawn as a short
// oriented stroke along its ridge instead of an isolated dot.
//
// Keeping the cloud rather than a grid is what makes zooming worthwhile: the
// positions are exact, so re-projecting into a magnified viewport shows real
// structure rather than magnified pixels.
//
// Cell layout, stride 5:
//   [0] t     instant, in samples from the start of the take
//   [1] f     frequency, Hz
//   [2] p     power, normalised so a given sound reads the same at any settings,
//             times this window length's share of the energy where the cell fell
//   [3] a     ridge direction, atan2(rise in Hz, run in samples)
//   [4] c     coherence, 0..1 — see below
//
// Cells come out in frame order, and a frame's cells all lie within half a
// window of its centre. Recording where each frame's cells begin therefore
// turns "draw the visible stretch" into a single contiguous range of the
// buffer, which is what lets one very large cloud be panned around cheaply.

export const STRIDE = 5;

// Cells are written straight into an array the caller owns, sized from the
// grid, rather than handed back in batches. The caller is an analysis worker
// staging a whole region so it can be transferred to the main thread in one
// piece — see `worker.js` — and writing into that array directly is one fewer
// copy of something that runs to hundreds of megabytes.

// Coherence.
//
// A real one-dimensional structure — tone, chirp, click — is measured many
// times over: every bin its lobe spreads across, every frame whose window
// covers it. All of those estimates land on the same ridge, and the
// displacement from one to the next lies *along* the direction this cell
// itself measured. So each cell is asked whether its neighbours corroborate
// it: the residual of the neighbour displacement perpendicular to the cell's
// own ridge direction, pushed through a Gaussian, is the coherence.
//
// One neighbour is not enough. Measured on synthetic signals, the neighbouring
// *bin* alone acquits noise and window sidelobes but also acquits the looping
// filaments that reassignment hangs between two components sharing a window —
// the loops are locally smooth, so along frequency they corroborate each
// other. The neighbouring *instant* is what convicts them: the loop wanders
// off the measured direction as time advances. Both tests have to pass —
// coherence takes the worse of the two residuals. Power-weighted mean
// coherence, measured: clean tone/chirp/click ~1.0, two-component loops ~0.38,
// white noise ~0.33, sidelobes ~0.2.
//
// Both comparisons are pinned to *absolute* distances so the answer does not
// depend on which analysis pass computed it — the same nesting guarantee the
// positions have. Along frequency the neighbour is one unpadded bin away
// (padding leaves those bins exactly where they were); along time it is REACH
// samples away, whatever the hop. A refining pass therefore reproduces the
// coherence of every cell it re-emits, and the picture does not restate itself
// on zoom.
//
// Two neighbours is as far as a per-cell test can see, and that is not far
// enough: the reassignment field of white noise is smooth over about one
// analysis window, so its most coherent cells pass this test as convincingly
// as a partial does. `ridge.js` follows the chains instead, and hands back a
// support gate that says whether a cell belongs to a ridge that goes anywhere.
// Coherence as emitted is the product: corroborated by its neighbours *and*
// part of something that lasts.
const COHERENCE_SIGMA = 0.15;

// Entries in the tabulated Gaussian above. 2048 across the four sigma that
// reach zero puts the lerp error at 5e-7.
const GAUSS_LUT = 2048;

// `frame0`..`frame1` is the stretch of the grid this call is responsible for
// emitting; `frames` is the whole grid it belongs to. A pass is cut into
// regions so a pool of workers can share it, and every region computes D extra
// frames beyond each of its ends so that the cross-frame coherence test sees
// exactly the neighbours it would have seen had one call done the lot. Only
// the true ends of the grid are allowed to have a missing neighbour, so a
// region boundary is invisible in the result.
export function analyzeCells({
  samples,
  sampleRate,
  winLen,
  fftSize,
  hop,
  frames,
  frame0 = 0,
  frame1 = frames,
  tStart,
  bin0,
  bins,
  fMin,
  fMax,
  ridge,
  share,
  shareFrames,
  rowScale,
  out,
}) {
  const fft = new FFT(fftSize);
  const centre = (winLen - 1) / 2;
  const align = -(winLen >> 1);

  const w = new Float32Array(winLen);
  const tw = new Float32Array(winLen);
  const dw = new Float32Array(winLen);

  let winSum = 0;

  for (let n = 0; n < winLen; n++) {
    const phase = (2 * Math.PI * n) / winLen;

    w[n] = 0.5 - 0.5 * Math.cos(phase);

    // Time-ramped window.
    tw[n] = (n - centre) * w[n];

    // Derivative of the Hann window.
    dw[n] = (Math.PI / winLen) * Math.sin(phase);

    winSum += w[n];
  }

  // Coherent gain, then one correction: zero padding samples the same spectrum
  // more finely, so the main lobe of a partial is spread over `fftSize/winLen`
  // times as many bins, all of which reassign onto the same ridge. Without
  // dividing it out, padding would make the picture brighter rather than finer.
  //
  // Nothing here depends on the hop, and that is deliberate. Halving the hop
  // doubles the cells along a ridge but also halves the gap between them, and
  // the renderer divides by how many strokes cover a pixel — so the brightness
  // already comes out the same, and dividing again here would make a ridge fade
  // every time it was sampled more finely. That is what used to make the
  // picture change colour on zoom.
  const scale = (2 / winSum) ** 2 / (fftSize / winLen);

  const nyq = fftSize / 2;
  const binHz = sampleRate / fftSize;
  const hzPerRad = sampleRate / (2 * Math.PI);

  // Normalising scales for the coherence residual, fixed by the window alone
  // so no pass can recolour cells another pass emitted.
  const step = fftSize / winLen; // one unpadded bin, in padded bins
  const tau = winLen / 4; // time scale, samples
  const phi = sampleRate / winLen; // frequency scale: one unpadded bin, Hz
  const sigmaNorm = 1 / (2 * COHERENCE_SIGMA * COHERENCE_SIGMA);
  const rCut = 4 * COHERENCE_SIGMA;

  // The band.
  //
  // A viewport shows a slice of the spectrum, and at a deep zoom a very thin
  // one — 2.6 kHz of 24 at 221x. Computing the whole spectrum there spends
  // 99.8% of the budget on cells nobody can see, which is what used to make the
  // picture *thin out* as it was zoomed into. `render.js` picks the band; this
  // emits it.
  //
  // Two ranges, not one. Cells are emitted over [eLo, eHi), but the frequency
  // half of the coherence test asks after the neighbour one unpadded bin away,
  // so a cell at the edge of the band would be judged by a neighbour that was
  // never computed. Computing `step` bins beyond each end is the frequency
  // analogue of the D frames a region computes beyond each of its ends, and it
  // has the same purpose: a cell is judged on exactly the evidence a
  // full-spectrum pass would have given it, so a band edge is invisible in the
  // result. Only the true ends of the spectrum are allowed a missing neighbour.
  //
  // Nothing else here is band-dependent. A cell's t, f, power and coherence are
  // computed from its own bin and its neighbours, so a cell carries the same
  // numbers whichever band it was emitted in — the same nesting guarantee the
  // hop and the padding have, and what lets a pass at a new viewport re-emit
  // what the last one drew rather than restating it.
  const eLo = Math.max(1, bin0);
  const eHi = Math.min(nyq, bin0 + bins);
  const cLo = Math.max(1, eLo - step);
  const cHi = Math.min(nyq, eHi + step);
  const width = cHi - cLo;

  // The Gaussian, tabulated. It is evaluated once per cell — tens of millions
  // of times a pass — and `Math.exp` costs about five times what a table
  // lookup and a lerp do. Maximum error against the real thing is 5e-7, which
  // is far below anything the drawing can express, and it is a table rather
  // than an approximation so a re-emitted cell still gets back exactly the
  // coherence it had.
  const gauss = new Float32Array(GAUSS_LUT + 2);

  for (let i = 0; i < gauss.length; i++) {
    const r = (i / GAUSS_LUT) * rCut;
    gauss[i] = Math.exp(-r * r * sigmaNorm);
  }

  const gaussScale = GAUSS_LUT / rCut;

  // The cross-frame comparison needs frames REACH samples away in both
  // directions, so frames pass through a ring and are emitted D frames behind
  // the analysis.
  //
  // Two rings, not one, and the reason is memory. A frame is somebody's
  // neighbour for `2D+1` frames, but a neighbour is only ever asked where it
  // landed — `t`, `f` and whether it exists at all. Its direction and its power
  // are its own business, wanted only when the frame itself is emitted, which
  // is `D` frames after it was computed. Splitting them takes a slot from 21
  // bytes a bin to 9, and at the deepest zoom, where D is 64 and there are
  // eight of these rings live at once, that is 800 MB.
  const D = Math.max(1, Math.round(REACH / hop));
  const R = 2 * D + 1;
  const H = D + 1;

  const slot = [];
  const heavy = [];

  for (let i = 0; i < R; i++) {
    slot.push({
      t: new Float32Array(width),
      f: new Float32Array(width),
      ok: new Uint8Array(width),
    });
  }

  for (let i = 0; i < H; i++) {
    heavy.push({
      run: new Float32Array(width),
      rise: new Float32Array(width),
      p: new Float32Array(width),
    });
  }

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  const dRe = new Float32Array(fftSize);
  const dIm = new Float32Array(fftSize);

  // The ridge map is indexed by absolute instant and by the unpadded bins every
  // pass shares, so a cell asks it the same question however finely it was
  // analysed — the support of a re-emitted cell is the support it already had.
  // It is read where the cell is *drawn*, at its reassigned instant, which is
  // what puts all of a click's frames on the one entry that saw the click.
  const support = ridge ? ridge.support : null;
  const mapFrames = ridge ? ridge.frames : 0;
  const mapBins = ridge ? ridge.bins : 0;
  const pad = fftSize / winLen;

  // This window length's share of the energy, on the arena `ridge.js` blended
  // it on: absolute instant along one axis, absolute frequency along the other,
  // so a re-emitted cell reads back the share it already had. Read bilinearly
  // rather than at the nearest entry — the arena's frames are REACH samples
  // apart, and at a deep zoom that is a wide enough step for nearest-entry
  // lookup to draw visible vertical seams through the picture.
  const shareRows = SHARE_ROWS;
  const lastRow = shareRows - 1;

  // Where each of this region's frames begins in `out`, plus one past the end.
  const starts = new Uint32Array(frame1 - frame0 + 1);

  let count = 0;

  // Residual of a neighbour's displacement perpendicular to this cell's
  // direction (dx, dy), all in normalised units. With no usable direction,
  // plain distance: an isolated dot needs a coincident neighbour to score.
  function residual(dx, dy, dlen, ddt, ddf) {
    return dlen > 1e-12
      ? Math.abs(ddt * dy - ddf * dx) / dlen
      : Math.sqrt(ddt * ddt + ddf * ddf);
  }

  function emit(e, computed) {
    starts[e - frame0] = count;

    const cur = slot[e % R];
    const hot = heavy[e % H];
    const back = e - D >= 0 ? slot[(e - D) % R] : null;
    const fwd = e + D <= computed ? slot[(e + D) % R] : null;

    for (let b = eLo; b < eHi; b++) {
      const bi = b - cLo;

      if (!cur.ok[bi]) {
        continue;
      }

      const f = cur.f[bi];

      if (f <= fMin || f >= fMax) {
        continue;
      }

      const dx = hot.run[bi] / tau;
      const dy = hot.rise[bi] / phi;

      // Not `Math.hypot`: it guards against overflow these values cannot
      // reach, and costs twelve times what the square root does. Once per
      // cell, that is a third of a second across a full pass.
      const dlen = Math.sqrt(dx * dx + dy * dy);

      // Along frequency: the better of the two unpadded-bin neighbours — a
      // cell at the edge of a lobe has one good neighbour and one that is
      // pure floor, and that should not convict it.
      let rB = Infinity;

      for (let s = -step; s <= step; s += 2 * step) {
        const nb = b + s;

        if (nb < cLo || nb >= cHi || !cur.ok[nb - cLo]) {
          continue;
        }

        const ni = nb - cLo;

        const r = residual(
          dx,
          dy,
          dlen,
          (cur.t[ni] - cur.t[bi]) / tau,
          (cur.f[ni] - cur.f[bi]) / phi,
        );

        if (r < rB) {
          rB = r;
        }
      }

      // Along time: the better of the two frames REACH away.
      let rF = Infinity;

      for (let side = 0; side < 2; side++) {
        const nb = side === 0 ? back : fwd;

        if (!nb || !nb.ok[bi]) {
          continue;
        }

        const r = residual(
          dx,
          dy,
          dlen,
          (nb.t[bi] - cur.t[bi]) / tau,
          (nb.f[bi] - cur.f[bi]) / phi,
        );

        if (r < rF) {
          rF = r;
        }
      }

      // Both tests have to pass; a missing side abstains rather than accuses.
      const r = Math.max(rB === Infinity ? 0 : rB, rF === Infinity ? 0 : rF);

      let conf = 0;

      if (r < rCut) {
        const x = r * gaussScale;
        const i = x | 0;
        const fr = x - i;

        conf = gauss[i] + (gauss[i + 1] - gauss[i]) * fr;
      }

      if (support) {
        // Nearest entry, not interpolated, and that was checked rather than
        // assumed: the map's entries are a screen-scale grid at a deep zoom, so
        // reading them flat could in principle draw seams. It does not, because
        // the gate is saturated wherever the energy is. Measured on synthetic
        // speech with pauses and plosives, the map is 32% intermediate by area
        // but only **0.03% of drawn power** reads an intermediate entry, and
        // none at all sits beside a boundary that jumps. The intermediate
        // entries are all in the silence. Interpolating would be four lookups
        // and three lerps per cell, tens of millions of times a pass, to move
        // nothing.
        const mf = Math.min(
          mapFrames - 1,
          Math.max(0, Math.round(cur.t[bi] / REACH)),
        );
        const mb = Math.min(mapBins - 1, Math.max(1, Math.round(b / pad)));

        conf *= support[mf * mapBins + mb] / 255;
      }

      let p = hot.p[bi];

      if (share) {
        const sf = cur.t[bi] / REACH;
        const i0 = sf <= 0 ? 0 : Math.min(shareFrames - 1, sf | 0);
        const i1 = Math.min(shareFrames - 1, i0 + 1);
        const ft = Math.min(1, Math.max(0, sf - i0));

        // sqrt, not log: the arena's rows are spaced in sqrt(f) precisely so
        // that this lookup costs one hardware instruction. Once per cell, and
        // there are tens of millions of them.
        const sy = Math.sqrt(f) * rowScale;
        const r0 = sy <= 0 ? 0 : Math.min(lastRow, sy | 0);
        const r1 = Math.min(lastRow, r0 + 1);
        const rt = Math.min(1, Math.max(0, sy - r0));

        const a0 = i0 * shareRows;
        const a1 = i1 * shareRows;

        const s0 = share[a0 + r0] + (share[a0 + r1] - share[a0 + r0]) * rt;
        const s1 = share[a1 + r0] + (share[a1 + r1] - share[a1 + r0]) * rt;

        p *= (s0 + (s1 - s0) * ft) / 255;
      }

      const at = count * STRIDE;

      out[at] = cur.t[bi];
      out[at + 1] = f;
      out[at + 2] = p;
      out[at + 3] = Math.atan2(hot.rise[bi], hot.run[bi]);
      out[at + 4] = conf;

      count++;
    }
  }

  // The frames this call has to *compute*, as opposed to emit: D beyond each
  // end of its own stretch, clipped to the grid. Clipping is the whole point —
  // a neighbour is missing only where the grid itself runs out, so a cell at a
  // region boundary is judged by the same evidence it would have been given by
  // a single call covering everything.
  const a0 = Math.max(0, frame0 - D);
  const a1 = Math.min(frames, frame1 + D);

  for (let frame = a0; frame < a1; frame++) {
    // hop is always a whole number of samples (render.js quantises it to a
    // power of two, floored at 1), so this rounding is only defensive.
    const off = tStart + Math.round(frame * hop) + align;

    for (let n = 0; n < winLen; n++) {
      const s = off + n;

      const v = s >= 0 && s < samples.length ? samples[s] : 0;

      re[n] = v * w[n];
      im[n] = v * tw[n];
      dRe[n] = v * dw[n];
    }

    // Only the imaginary half of the derivative transform needs clearing:
    // everything past `winLen` is zero padding the transform is told about
    // rather than made to read, and every other input slot below it was just
    // written.
    dIm.fill(0, 0, winLen);

    // Two real sequences packed into one complex transform, unpacked per bin
    // below; the derivative window needs a transform of its own.
    fft.transform(re, im, winLen);
    fft.transform(dRe, dIm, winLen);

    const frameCentre = off + centre;
    const cur = slot[frame % R];
    const hot = heavy[frame % H];

    for (let b = cLo; b < cHi; b++) {
      const bi = b - cLo;

      cur.ok[bi] = 0;

      const j = fftSize - b;

      // The ordinary windowed transform.
      const xr = (re[b] + re[j]) * 0.5;
      const xi = (im[b] - im[j]) * 0.5;

      // The time-ramped transform.
      const tr = (im[b] + im[j]) * 0.5;
      const ti = (re[j] - re[b]) * 0.5;

      const power = xr * xr + xi * xi;

      if (power < 1e-20) {
        continue;
      }

      // Re{X_tw / X} — displacement in samples from the window centre.
      let dt = (tr * xr + ti * xi) / power;

      // Numerical noise must not fling a cell outside its own window.
      if (dt > centre) {
        dt = centre;
      } else if (dt < -centre) {
        dt = -centre;
      }

      // -Im{X_dw / X} — displacement in Hz from the bin centre.
      const df = -((dIm[b] * xr - dRe[b] * xi) / power) * hzPerRad;

      // Ridge direction. For a signal that is locally a linear chirp,
      //
      //   X_dw / X = -i(wi - w) - i*q*(X_tw / X)
      //
      // where q is the chirp rate. The first term is purely imaginary, so
      // taking real parts leaves Re{X_dw/X} = q * Im{X_tw/X}: the chirp rate is
      // a ratio of two quantities already in hand, at the cost of no extra
      // transform. Carrying them as a *pair* rather than dividing keeps the
      // degenerate cases finite — a steady tone has zero rise and a click has
      // zero run, and a ratio would blow up on one or the other.
      const run = (ti * xr - tr * xi) / power; // Im{X_tw / X}, samples
      const rise = (dRe[b] * xr + dIm[b] * xi) / power; // Re{X_dw / X}, rad/sample

      cur.t[bi] = frameCentre + dt;
      cur.f[bi] = b * binHz + df;
      hot.run[bi] = run;
      hot.rise[bi] = rise * hzPerRad;
      hot.p[bi] = power * scale;
      cur.ok[bi] = 1;
    }

    const e = frame - D;

    if (e >= frame0 && e < frame1) {
      emit(e, frame);
    }
  }

  // The tail of the pipeline: frames whose forward neighbour never arrived,
  // which happens only where `a1` hit the end of the grid.
  for (let e = Math.max(frame0, a1 - D); e < frame1; e++) {
    emit(e, a1 - 1);
  }

  starts[frame1 - frame0] = count;

  return {count, starts};
}
