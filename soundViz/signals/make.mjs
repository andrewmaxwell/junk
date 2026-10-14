// Renders every signal in `signals.js` to a 16-bit mono WAV beside it.
//
//   node soundViz/signals/make.mjs
//
// Then load one in the page with the open button, by dropping it on the window,
// or with `?file=signals/<name>.wav`.

import {writeFileSync} from 'node:fs';
import {SIGNALS, SAMPLE_RATE, render} from './signals.js';

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);

  samples.forEach((v, i) => {
    buf.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, v)) * 32767),
      44 + i * 2,
    );
  });

  return buf;
}

for (const name of Object.keys(SIGNALS)) {
  const file = new URL(`./${name}.wav`, import.meta.url);
  writeFileSync(file, wav(render(name)));
  console.log(file.pathname);
}
