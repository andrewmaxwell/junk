import {log, clearLog, yieldToBrowser} from './ui.js';
import {getSystemInfo, logicalCores} from './telemetry.js';
import {runSingleCore, runMultiCore} from './cpu.js';
import {runGPU} from './gpu.js';
import {runMemory} from './memory.js';
import {runDOM} from './dom.js';

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

    await runSingleCore();
    await yieldToBrowser();
    await runMultiCore();
    await yieldToBrowser();
    await runGPU();
    await yieldToBrowser();
    await runDOM();
    await yieldToBrowser();
    await runMemory();
    log('<br><b>All benchmarks finished.</b>');

    const singleEl = document.getElementById('res-single');
    const multiEl = document.getElementById('res-multi');
    const gpuEl = document.getElementById('res-gpu');
    const domEl = document.getElementById('res-dom');
    const memEl = document.getElementById('res-mem');

    const single = singleEl ? parseFloat(singleEl.innerText) || 0 : 0;
    const multi = multiEl ? parseFloat(multiEl.innerText) || 0 : 0;
    const gpu = gpuEl ? parseFloat(gpuEl.innerText) || 0 : 0;
    const dom = domEl ? parseFloat(domEl.innerText) || 0 : 0;
    const mem = memEl ? parseFloat(memEl.innerText) || 0 : 0;

    // Weight DOM at 2x. E.g. 150 K-Ops/s * 2 = 300 compute score mapping.
    const computeIndex = Math.round(
      single * 50 + multi * 10 + gpu * 0.25 + dom * 2 + mem * 10,
    );

    if (sEl) sEl.innerText = computeIndex.toLocaleString();

    let cpuMatch = 'Entry-level CPU';
    if (multi > 10) cpuMatch = 'Mid-range Desktop/Laptop CPU';
    if (multi > 30)
      cpuMatch = 'High-end CPU (e.g. Apple M-Series, Core i7/Ryzen 7)';
    if (multi > 80) cpuMatch = 'Enthusiast CPU (e.g. Core i9, Threadripper)';

    let gpuMatch = 'Integrated Graphics';
    if (gpu > 300) gpuMatch = 'Entry-level Dedicated / Advanced APU';
    if (gpu > 2000) gpuMatch = 'Mid-range GPU (e.g. GTX 1060 / Apple M1/M2)';
    if (gpu > 7000) gpuMatch = 'High-end GPU (e.g. RTX 3060 / Apple M2 Max)';
    if (gpu > 15000) gpuMatch = 'Enthusiast GPU (e.g. RTX 3080 / RTX 4090)';

    let ramMatch = 'Standard DDR3 / Single-Channel';
    if (mem > 20) ramMatch = 'Dual-Channel DDR4 / LPDDR4';
    if (mem > 45) ramMatch = 'High-performance DDR5 / LPDDR5';
    if (mem > 90) ramMatch = 'Unified Memory (e.g. Apple M-Series Max/Pro)';
    if (mem > 200) ramMatch = 'Ultra-Unified workstation memory';

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
        const textToCopy = `Total Compute Estimator Score: ${computeIndex.toLocaleString()}
${info}

Single-Core: ${single.toFixed(2)} GFLOPS
Multi-Core: ${multi.toFixed(2)} GFLOPS
GPU Compute: ${gpu.toFixed(2)} GFLOPS
DOM Rendering: ${dom.toFixed(2)} K-Ops/s
System RAM: ${mem.toFixed(2)} GB/s`;
        navigator.clipboard.writeText(textToCopy).then(() => {
          shareBtn.innerText = '✅ Copied to Clipboard!';
          setTimeout(() => {
            shareBtn.innerText = '📋 Copy Results to Clipboard';
          }, 2000);
        });
      };
    }

    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Run Again';
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
    if (statusText) statusText.innerText = 'Ready.';
    isRunning = false;
  }

  const runBtn = document.getElementById('btn-run');
  if (runBtn) runBtn.addEventListener('click', runAllBenchmarks);

  runAllBenchmarks();
});
