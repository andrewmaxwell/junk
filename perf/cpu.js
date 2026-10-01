import {log, yieldToBrowser, updateScore} from './ui.js';
import {logicalCores} from './telemetry.js';
import {makeWorkerUrl, runParallel} from './workers.js';

// Many independent chains so the FP units always have work ready. With only a
// few chains, each one stalls waiting on its own previous result and we end up
// measuring latency instead of throughput.
const CHAINS = 16;
const UNROLL = 4;
const vars = Array.from({length: CHAINS}, (_, i) => `v${i}`);
const fmaLine = vars.map((v) => `${v}=(${v}*a)+b;`).join(' ');
const cpuMathCore = Array(UNROLL).fill(fmaLine).join('\n      ');
// One multiply and one add per chain per line
const FLOPS_PER_ITERATION = CHAINS * UNROLL * 2;

const cpuWorkerUrl = makeWorkerUrl(`
  const startV = (Date.now() % 10) * 0.00001;
  const A = -0.9999 - startV, B = 2.5 + startV;
  let N = 1000;

  function spin(n) {
    const a = A, b = B;
    let ${vars.map((v, i) => `${v} = ${1 + i / 100}`).join(', ')};
    for (let i = 0; i < n; i++) {
      ${cpuMathCore}
    }
    return ${vars.join(' + ')};
  }

  // Grow the batch until one takes >20ms so timer overhead is negligible
  function setup() {
    while (true) {
      const t0 = performance.now();
      spin(N);
      if (performance.now() - t0 > 20) break;
      N *= 2;
    }
  }

  function run(durationMs) {
    let work = 0, sanity = 0;
    const start = now();
    while (now() - start < durationMs) {
      sanity = spin(N);
      work += N * ${FLOPS_PER_ITERATION};
    }
    return { work, start, end: now(), sanity };
  }
`);

export async function runSingleCore() {
  const el = document.getElementById('res-single');
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  const result = await runParallel(cpuWorkerUrl, 1, null, 1500);
  const gflops = result.perSecond / 1e9;

  updateScore('res-single', gflops, 30);
  log(`✓ Single-Core complete. (Sanity check: ${result.sanity})`);
  return gflops;
}

export async function runMultiCore() {
  const el = document.getElementById('res-multi');
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  // If logicalCores is null (obfuscated by privacy browsers), spawn 8 concurrent workers.
  // This is a safe brute-force fallback that will saturate typical mobile/laptop CPUs
  // without heavily overwhelming the OS scheduler on older dual-core machines.
  const threadsToSpawn = logicalCores || 8;

  const result = await runParallel(cpuWorkerUrl, threadsToSpawn, null, 2500);
  const gflops = result.perSecond / 1e9;

  updateScore('res-multi', gflops, 175);
  log(`✓ Multi-Core complete. (Combined sanity: ${result.sanity})`);
  return gflops;
}
