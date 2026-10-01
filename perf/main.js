import { runMultiCore, runSingleCore } from './cpu.js';
import { runDOM } from './dom.js';
import { runGPU } from './gpu.js';
import { runMemory } from './memory.js';
import { getSystemInfo, logicalCores } from './telemetry.js';
import { clearLog, log, yieldToBrowser } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const multiLabelEl = document.getElementById('multi-label');
  if (multiLabelEl) {
    multiLabelEl.innerText = logicalCores
      ? `All Cores CPU (${logicalCores} Threads):`
      : 'All Cores CPU (Unknown Threads):';
  }

  const infoEl = document.getElementById('sys-info');
  if (infoEl) infoEl.innerText = getSystemInfo();

  let isRunning = false;

  // Browsers heavily throttle background tabs, so flag any test that ran
  // while this one was hidden
  let wasHidden = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) wasHidden = true;
  });

  async function runAllBenchmarks() {
    if (isRunning) return;
    isRunning = true;

    const btn = /** @type {HTMLButtonElement} */ (
      document.getElementById('btn-run')
    );
    const statusText = document.getElementById('status-text');

    const shareBtn = document.getElementById('btn-share');
    if (shareBtn) {
      shareBtn.style.opacity = '0';
      shareBtn.style.pointerEvents = 'none';
      shareBtn.innerText = '📋 Copy Results to Clipboard';
    }

    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Running...';
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }

    if (statusText) {
      statusText.innerText = 'Running automated hardware benchmarks...';
    }

    ['res-single', 'res-multi', 'res-gpu', 'res-dom', 'res-mem'].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) {
          el.innerText = 'Queued...';
          if (el.parentElement)
            el.parentElement.style.setProperty('--pct', '0%');
        }
      },
    );

    const sEl = document.getElementById('res-score');
    if (sEl) sEl.innerText = 'Calculating...';

    clearLog();

    try {
      await runBenchmarks(shareBtn, sEl);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Run Again';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
      if (statusText) statusText.innerText = 'Ready.';
      isRunning = false;
    }
  }

  /**
   * Runs one benchmark, turning a failure into a score of 0 so the rest
   * still run.
   * @param {string} id
   * @param {string} name
   * @param {() => Promise<number>} run
   */
  async function attempt(id, name, run) {
    wasHidden = document.hidden;
    try {
      const result = await run();
      if (wasHidden) {
        log(
          `<span style="color: #dcdcaa">⚠ ${name} ran while the tab was hidden; its result is probably too low.</span>`,
        );
      }
      return result;
    } catch (e) {
      console.error(e);
      const el = document.getElementById(id);
      if (el) el.innerText = 'Failed';
      const message = String(e instanceof Error ? e.message : e)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;');
      log(`<span style="color: #f44747">✗ ${name} failed: ${message}</span>`);
      return 0;
    } finally {
      await yieldToBrowser();
    }
  }

  /**
   * @param {HTMLElement | null} shareBtn
   * @param {HTMLElement | null} sEl
   */
  async function runBenchmarks(shareBtn, sEl) {
    const single = await attempt('res-single', 'Single-Core', runSingleCore);
    const multi = await attempt('res-multi', 'Multi-Core', runMultiCore);
    const gpu = await attempt('res-gpu', 'GPU', runGPU);
    const dom = await attempt('res-dom', 'DOM', runDOM);
    const mem = await attempt('res-mem', 'Memory', runMemory);
    log('<br><b>All benchmarks finished.</b>');

    // Calculate the Geometric Mean. This is the mathematically perfect industry standard (used by SPEC/Geekbench)
    // for normalizing vastly different numerical ranges so no single test can arbitrarily dominate the final score.
    const gMean = Math.pow(
      Math.max(single, 1) *
        Math.max(multi, 1) *
        Math.max(gpu, 1) *
        Math.max(dom, 1) *
        Math.max(mem, 1),
      1 / 5,
    );

    // Cosmetic scale to a 4-digit UI score. 17.4 keeps scores in line with
    // earlier versions of this page, which measured less of the CPU and RAM
    // and used ×30 (calibrated on an Apple M4: ~2,880 before and after).
    const computeIndex = Math.round(gMean * 17.4);

    if (sEl) sEl.innerText = computeIndex.toLocaleString();

    let cpuMatch = 'Entry-level CPU';
    if (multi > 30) cpuMatch = 'Mid-range Desktop/Laptop CPU';
    if (multi > 80)
      cpuMatch = 'High-end CPU (e.g. Apple M-Series, Core i7/Ryzen 7)';
    if (multi > 220) cpuMatch = 'Enthusiast CPU (e.g. Core i9, Threadripper)';

    let gpuMatch = 'Integrated Graphics';
    if (gpu > 300) gpuMatch = 'Entry-level Dedicated / Advanced APU';
    if (gpu > 2000) gpuMatch = 'Mid-range GPU (e.g. GTX 1060 / Apple M1/M2)';
    if (gpu > 7000) gpuMatch = 'High-end GPU (e.g. RTX 3060 / Apple M2 Max)';
    if (gpu > 15000) gpuMatch = 'Enthusiast GPU (e.g. RTX 3080 / RTX 4090)';

    let ramMatch = 'Standard DDR3 / Single-Channel';
    if (mem > 20) ramMatch = 'Dual-Channel DDR4 / LPDDR4';
    if (mem > 45) ramMatch = 'High-performance DDR5 / LPDDR5';
    if (mem > 150) ramMatch = 'Unified Memory (e.g. Apple M-Series Max/Pro)';
    if (mem > 300) ramMatch = 'Ultra-Unified workstation memory';

    log(`<span style="color: #4ec9b0">↳ CPU Class: ${cpuMatch}</span>`);
    if (gpu > 0)
      log(`<span style="color: #4ec9b0">↳ GPU Class: ${gpuMatch}</span>`);
    if (mem > 0)
      log(`<span style="color: #4ec9b0">↳ RAM Class: ${ramMatch}</span>`);

    if (shareBtn) {
      shareBtn.style.opacity = '1';
      shareBtn.style.pointerEvents = 'auto';

      shareBtn.onclick = () => {
        const info = infoEl ? infoEl.innerText : '';
        const multiLabel = multiLabelEl
          ? multiLabelEl.innerText
          : 'All Cores CPU:';

        const textToCopy = `${info}
Single-Core CPU: ${single.toFixed(2)} GFLOPS
${multiLabel} ${multi.toFixed(2)} GFLOPS
GPU (WebGL2): ${gpu.toFixed(2)} GFLOPS
DOM & UI Rendering: ${dom.toFixed(2)} K-Ops/s
System RAM (Memcopy): ${mem.toFixed(2)} GB/s
Unified Compute Score: ${computeIndex.toLocaleString()}`;

        navigator.clipboard.writeText(textToCopy).then(() => {
          shareBtn.innerText = '✅ Copied to Clipboard!';
          setTimeout(() => {
            shareBtn.innerText = '📋 Copy Results to Clipboard';
          }, 2000);
        });
      };
    }
  }

  const runBtn = document.getElementById('btn-run');
  if (runBtn) runBtn.addEventListener('click', runAllBenchmarks);

  runAllBenchmarks();
});
