import {analyzeCells, STRIDE} from './reassign.js';
import {buildRidge} from './ridge.js';

// One of a pool of analysis threads. `render.js` hands each of these a copy of
// the recording once, then a copy of the ridge map once, then one message per
// region of each pass. Everything expensive about a pass happens here, which is
// the whole point: the main thread stays free to draw and to answer gestures
// while seconds of transforms are going on.
//
// A region is staged whole and handed back in one transfer rather than
// streamed. The cloud in the GL buffer is what is on screen, so it cannot be
// written over until the pass that replaces it is complete — streaming would
// mean drawing half of a new picture on top of half of an old one.

let samples = null;
let sampleRate = 0;

let ridge = null;

self.onmessage = ({data}) => {
  switch (data.type) {
    // The recording itself, once per take.
    case 'audio':
      samples = data.samples;
      sampleRate = data.sampleRate;
      ridge = null;
      break;

    // Build the ridge map. Asked of one worker only; the answer is copied to
    // the others, which is far cheaper than each of them walking the chains.
    case 'ridge': {
      ridge = buildRidge({samples, sampleRate, winLen: data.winLen});

      postMessage({
        job: data.job,
        support: ridge.support,
        frames: ridge.frames,
        bins: ridge.bins,
      });

      break;
    }

    // Somebody else's copy of the map.
    case 'map':
      ridge = {support: data.support, frames: data.frames, bins: data.bins};
      break;

    case 'cells': {
      const {frame0, frame1, bins} = data;

      // Room for every frame of the region at its widest — one cell per bin.
      // The tail goes unused wherever a bin fell outside the audible band or
      // held no energy at all, which is what the region's own `starts` are for.
      const out = new Float32Array((frame1 - frame0) * bins * STRIDE);

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
