import {analyzeCells, STRIDE} from './reassign.js';
import {buildRidge, blendScales, rowScaleFor} from './ridge.js';

// One of a pool of analysis threads. `render.js` hands each of these a copy of
// the recording once, then a copy of the ridge maps and share maps once, then
// one message per region of each pass. Everything expensive about a pass
// happens here, which is the whole point: the main thread stays free to draw
// and to answer gestures while seconds of transforms are going on.
//
// A region is staged whole and handed back in one transfer rather than
// streamed. The cloud in the GL buffer is what is on screen, so it cannot be
// written over until the pass that replaces it is complete — streaming would
// mean drawing half of a new picture on top of half of an old one.
//
// "Scale" throughout means one of the window lengths the picture is built from.
// Each has a ridge map of its own — the map's bins are that window's bins — and
// a share map saying how much of the energy it is entitled to draw where.

let samples = null;
let sampleRate = 0;

// Indexed by scale.
let ridges = [];
let shares = [];

self.onmessage = ({data}) => {
  switch (data.type) {
    // The recording itself, once per take.
    case 'audio':
      samples = data.samples;
      sampleRate = data.sampleRate;
      ridges = [];
      shares = [];
      break;

    // Build one scale's ridge map, and with it that scale's fitness — how well
    // its window explains the energy, cell by cell of the share arena. One
    // scale per worker, so the scales are walked in parallel; the answers are
    // copied to the others afterwards, which is far cheaper than each of them
    // walking every chain.
    case 'ridge': {
      const map = buildRidge({
        samples,
        sampleRate,
        winLen: data.winLen,
        fMin: data.fMin,
        fMax: data.fMax,
      });

      ridges[data.scale] = map;

      postMessage(
        {
          job: data.job,
          scale: data.scale,
          support: map.support,
          frames: map.frames,
          bins: map.bins,
          sumP: map.sumP,
          sumPG: map.sumPG,
        },
        [map.sumP.buffer, map.sumPG.buffer],
      );

      break;
    }

    // Divide the energy between the scales. Asked of one worker once the
    // fitnesses are all in; the shares it returns are then copied to every
    // worker along with the maps.
    case 'blend': {
      const share = blendScales(data.parts, data.frames, data.priors);

      postMessage(
        {job: data.job, share},
        share.map(a => a.buffer),
      );

      break;
    }

    // Somebody else's copies. A worker that built one of these maps is sent
    // null in its place rather than a second copy of what it already has.
    case 'maps':
      data.maps.forEach((map, s) => {
        if (map) {
          ridges[s] = {support: map.support, frames: map.frames, bins: map.bins};
        }
      });

      shares = data.share;
      break;

    case 'cells': {
      const {frame0, frame1, bins, scale} = data;

      // Room for every frame of the region at its widest — one cell per bin.
      // The tail goes unused wherever a bin fell outside the audible band or
      // held no energy at all, which is what the region's own `starts` are for.
      const out = new Float32Array((frame1 - frame0) * bins * STRIDE);

      const ridge = ridges[scale];

      const {count, starts} = analyzeCells({
        samples,
        sampleRate,
        winLen: data.winLen,
        fftSize: data.fftSize,
        hop: data.hop,
        frames: data.frames,
        frame0,
        frame1,
        tStart: data.tStart,
        fMin: data.fMin,
        fMax: data.fMax,
        ridge,
        share: shares[scale],
        shareFrames: ridge ? ridge.frames : 0,
        rowScale: rowScaleFor(sampleRate),
        out,
      });

      postMessage({job: data.job, frame0, frame1, count, starts, cells: out}, [
        out.buffer,
        starts.buffer,
      ]);

      break;
    }
  }
};
