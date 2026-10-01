import {log, yieldToBrowser, updateScore} from './ui.js';
import {logicalCores} from './telemetry.js';
import {makeWorkerUrl, runParallel} from './workers.js';

// Total footprint across all workers, well past any CPU cache. One thread
// can't saturate a multi-channel memory bus, so every core copies its own share.
const TOTAL_BYTES = 256 * 1024 * 1024;

const memWorkerUrl = makeWorkerUrl(`
  let src, dst;

  function setup(elements) {
    src = new Float64Array(elements);
    dst = new Float64Array(elements);
    src.fill(Math.random());
    // Fault in every page of dst before timing
    for (let i = 0; i < 3; i++) dst.set(src);
  }

  function run(durationMs) {
    let work = 0;
    const start = now();
    while (now() - start < durationMs) {
      for (let i = 0; i < 5; i++) dst.set(src);
      // Each copy reads src and writes dst
      work += src.byteLength * 2 * 5;
    }
    return { work, start, end: now(), sanity: dst[dst.length - 1] };
  }
`);

export async function runMemory() {
  const el = document.getElementById('res-mem');
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  const threads = logicalCores || 8;
  const elementsPerArray = Math.floor(TOTAL_BYTES / 2 / 8 / threads);
  const result = await runParallel(memWorkerUrl, threads, elementsPerArray, 1500);
  const gbPerSec = result.perSecond / 1e9;

  updateScore('res-mem', gbPerSec, 200, 'GB/s');
  log(`✓ Memory bandwidth complete. (${threads} threads)`);
  return gbPerSec;
}
