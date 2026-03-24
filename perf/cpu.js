import {log, yieldToBrowser, updateScore} from './ui.js';
import {logicalCores} from './telemetry.js';

const UNROLL_CPU = 16;
const cpuFmaLine =
  'v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;\n          ';
const cpuMathCore = Array(UNROLL_CPU).fill(cpuFmaLine).join('');

const getWorkerScript = () => `
  function calculateFlops(durationMs) {
    const startV = (Date.now() % 10) * 0.00001; 
    const a = -0.9999 - startV, b = 2.5 + startV;
    let v1 = 1.1, v2 = 1.2, v3 = 1.3, v4 = 1.4;
    
    let N = 1000;
    let elapsed = 0;
    while(true) {
      let t0 = performance.now();
      for(let i = 0; i < N; i++) {
        ${cpuMathCore}
      }
      let t1 = performance.now();
      elapsed = t1 - t0;
      if (elapsed > 20) break; 
      N *= 2;
    }

    let totalTime = 0;
    let totalOps = 0;
    const baseOps = N * ${UNROLL_CPU * 8};
    
    const startTest = performance.now();
    while(performance.now() - startTest < durationMs) {
      let t0 = performance.now();
      for(let i = 0; i < N; i++) {
        ${cpuMathCore}
      }
      let t1 = performance.now();
      totalTime += (t1 - t0);
      totalOps += baseOps; 
    }

    return { timeInSeconds: totalTime / 1000, ops: totalOps, sanity: v1 + v2 + v3 + v4 };
  }

  self.onmessage = function(e) {
    self.postMessage(calculateFlops(e.data));
  };
`;

const cpuWorkerBlob = new Blob([getWorkerScript()], {
  type: 'application/javascript',
});
export const cpuWorkerUrl = URL.createObjectURL(cpuWorkerBlob);

/** @param {number} durationMs */
export function runInWorker(durationMs) {
  return new Promise((resolve) => {
    const worker = new Worker(cpuWorkerUrl);
    worker.onmessage = function (e) {
      worker.terminate();
      resolve(e.data);
    };
    worker.postMessage(durationMs);
  });
}

export async function runSingleCore() {
  const el = /** @type {HTMLElement} */ (document.getElementById('res-single'));
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  const result = await runInWorker(1500);
  const gflops = result.ops / result.timeInSeconds / 1e9;

  updateScore('res-single', gflops, 10);
  log(`✓ Single-Core complete. (Sanity check: ${result.sanity})`);
}

export async function runMultiCore() {
  const el = /** @type {HTMLElement} */ (document.getElementById('res-multi'));
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  // If logicalCores is null (obfuscated by privacy browsers), spawn 8 concurrent workers.
  // This is a safe brute-force fallback that will saturate typical mobile/laptop CPUs
  // without heavily overwhelming the OS scheduler on older dual-core machines.
  const threadsToSpawn = logicalCores || 8;

  const promises = Array(threadsToSpawn).fill(2500).map(runInWorker);
  const results = await Promise.all(promises);

  let combinedOpsPerSec = 0;
  let combinedSanity = 0;

  for (const res of results) {
    combinedOpsPerSec += res.ops / res.timeInSeconds;
    combinedSanity += res.sanity;
  }

  updateScore('res-multi', combinedOpsPerSec / 1e9, 60);
  log(`✓ Multi-Core complete. (Combined sanity: ${combinedSanity})`);
}
