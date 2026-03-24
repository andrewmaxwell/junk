import {log, yieldToBrowser, updateScore} from './ui.js';

const sizeElements = 16 * 1024 * 1024;
/** @type {Float64Array | null} */
let src = null;
/** @type {Float64Array | null} */
let dst = null;

export async function runMemory() {
  const el = /** @type {HTMLElement} */ (document.getElementById('res-mem'));
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  // Lazy-init giant 128MB arrays once globally to permanently prevent V8
  // Out-Of-Memory heap crash limits when users spam the "Run Again" button!
  if (!src || !dst) {
    src = new Float64Array(sizeElements);
    dst = new Float64Array(sizeElements);
    for (let i = 0; i < sizeElements; i += 4096) {
      src[i] = Math.random();
    }
  }

  for (let i = 0; i < 3; i++) {
    dst.set(src);
  }

  let totalTime = 0;
  let totalBytesMoved = 0;
  const testDuration = 1500;

  const startTest = performance.now();
  while (performance.now() - startTest < testDuration) {
    let t0 = performance.now();
    for (let i = 0; i < 5; i++) {
      dst.set(src);
      src[0] = performance.now();
    }
    let t1 = performance.now();

    totalTime += t1 - t0;
    totalBytesMoved += sizeElements * 8 * 2 * 5;

    await yieldToBrowser();
  }

  const gbPerSec = totalBytesMoved / 1e9 / (totalTime / 1000);
  updateScore('res-mem', gbPerSec, 100, 'GB/s');
  log(
    `✓ Memory bandwidth complete. (${(totalBytesMoved / 1e9).toFixed(1)} GB moved)`,
  );
}
