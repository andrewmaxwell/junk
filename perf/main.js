document.addEventListener('DOMContentLoaded', async () => {
  const logicalCores = navigator.hardwareConcurrency || 4;
  const coreCountEl = /** @type {HTMLElement} */ (
    document.getElementById('core-count')
  );
  coreCountEl.innerText = logicalCores.toString();

  const logElement = /** @type {HTMLElement} */ (
    document.getElementById('log')
  );
  /** @param {string} msg */
  const log = (msg) => {
    logElement.innerHTML += msg + '<br>';
  };

  // Utility to let the browser update the UI before locking the thread with heavy math
  const yieldToBrowser = () =>
    new Promise((resolve) => setTimeout(resolve, 50));

  // --- UI Formatting Utility ---
  /**
   * @param {string} elementId
   * @param {number} value
   * @param {number} maxValue
   * @param {string} [unit]
   */
  function updateScore(elementId, value, maxValue, unit = 'GFLOPS') {
    const el = /** @type {HTMLElement} */ (document.getElementById(elementId));
    if (!el) return;
    el.innerText = `${value.toFixed(2)} ${unit}`;
    if (el.parentElement) {
      el.parentElement.style.setProperty(
        '--pct',
        Math.min((value / maxValue) * 100, 100) + '%',
      );
    }
  }

  // --- CPU Benchmark Generation ---
  // Programmatically generate unrolled loop to keep code extremely clean
  // 4 statements x 2 ops = 8 ops per line. 16 lines = 128 ops per loop.
  const UNROLL_CPU = 16;
  const cpuFmaLine =
    'v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;\n          ';
  const cpuMathCore = Array(UNROLL_CPU).fill(cpuFmaLine).join('');

  const getWorkerScript = () => `
    function calculateFlops(durationMs) {
      // Prevent static analysis optimizations by using dynamic seed.
      // We use oscillating stable FMA values to prevent Infinity and CPU FPU power-gating.
      const startV = (Date.now() % 10) * 0.00001; 
      const a = -0.9999 - startV, b = 2.5 + startV;
      let v1 = 1.1, v2 = 1.2, v3 = 1.3, v4 = 1.4;
      
      // JIT Warmup & Calibration Phase
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

      // Measurement Phase
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

  // Create worker pool URL once to reduce memory and GC fragmentation
  const cpuWorkerBlob = new Blob([getWorkerScript()], {
    type: 'application/javascript',
  });
  const cpuWorkerUrl = URL.createObjectURL(cpuWorkerBlob);

  /** @param {number} durationMs */
  function runInWorker(durationMs) {
    return new Promise((resolve) => {
      const worker = new Worker(cpuWorkerUrl);
      worker.onmessage = function (e) {
        worker.terminate();
        resolve(e.data);
      };
      // Pass the target duration dynamically to avoid evaluating the Blob string multiple times
      worker.postMessage(durationMs);
    });
  }

  // --- 1. SINGLE CORE CPU (FP64) ---
  async function runSingleCore() {
    const el = /** @type {HTMLElement} */ (
      document.getElementById('res-single')
    );
    el.innerText = 'Calculating...';
    await yieldToBrowser();

    // Run for 1.5 seconds in a worker to keep UI responsive and get accurate measurement
    const result = await runInWorker(1500);
    const gflops = result.ops / result.timeInSeconds / 1e9;

    updateScore('res-single', gflops, 10);
    log(`✓ Single-Core complete. (Sanity check: ${result.sanity})`);
  }

  // --- 2. MULTI-CORE CPU (FP64) ---
  async function runMultiCore() {
    const el = /** @type {HTMLElement} */ (
      document.getElementById('res-multi')
    );
    el.innerText = 'Calculating...';
    await yieldToBrowser();

    // We run for 2.5 seconds to ensure all workers definitely overlap during their
    // performance.now() window, pushing thermal limits and concurrent capability.
    const promises = Array(logicalCores).fill(2500).map(runInWorker);
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

  // --- 3. GPU (FP32) via WebGL2 ---
  async function runGPU() {
    const el = /** @type {HTMLElement} */ (document.getElementById('res-gpu'));
    el.innerText = 'Calculating...';
    await yieldToBrowser();

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;

    // Request high-performance GPU if multiple exist (e.g. integrated vs discrete)
    const gl = canvas.getContext('webgl2', {
      powerPreference: 'high-performance',
    });

    if (!gl) {
      el.innerText = 'WebGL2 Not Supported';
      log('✗ GPU benchmark skipped (WebGL2 not available).');
      return;
    }

    const UNROLL_GPU = 10;
    const gpuFmaLine =
      'v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;\n        ';
    const gpuMathCore = Array(UNROLL_GPU).fill(gpuFmaLine).join('');

    const vsSource = `#version 300 es
      in vec4 a_position;
      void main() { gl_Position = a_position; }
    `;

    // The fragment shader does the heavy lifting.
    // Unrolled loops inside avoid shader loop overhead.
    const fsSource = `#version 300 es
      precision highp float;
      uniform int u_loops;
      out vec4 outColor;
      void main() {
        float v1 = 1.1, v2 = 1.2, v3 = 1.3, v4 = 1.4;
        
        // Use coordinates to prevent compiler from totally optimizing out uniform constants.
        // We use oscillating stable FMA values to prevent Infinity which ruins WebGL precision.
        float a = -0.9999 - (gl_FragCoord.x * 0.0000001);
        float b = 2.5 + (gl_FragCoord.y * 0.0000001);
        
        for(int i = 0; i < u_loops; i++) {
          ${gpuMathCore}
        }
        
        // Output depends on all variables so the loop isn't dead-code eliminated
        outColor = vec4(fract(v1), fract(v2), fract(v3), fract(v4));
      }
    `;

    /** @param {number} type @param {string} src */
    const compile = (type, src) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create shader');
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    const u_loops_loc = gl.getUniformLocation(program, 'u_loops');
    const pixel = new Uint8Array(4);

    // Warm up & Setup GPU workload size
    // We calibrate to find a chunk size that takes ~50ms to prevent browser freezes (TDRs)
    let loops = 20;
    let timeMs = 0;

    while (true) {
      gl.uniform1i(u_loops_loc, loops);

      // readPixels blocks CPU until GPU finishes any previous commands
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      let t0 = performance.now();
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // readPixels again forces a sync, giving us precise execution time of the draw call
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      timeMs = performance.now() - t0;
      if (timeMs > 30) break; // found a good stable chunk

      loops *= 4;
      if (loops > 200000) {
        loops = 200000; // safety ceiling
        break;
      }
    }

    // Scale chunk length to ~250ms for the actual benchmark
    const targetLoops = Math.max(
      1,
      Math.min(500000, Math.floor(loops * (250 / Math.max(timeMs, 1)))),
    );

    let totalTime = 0;
    let totalOps = 0;
    const testFrames = 6; // 6 * 250ms = 1.5 seconds total runtime
    const opsPerPixel = targetLoops * UNROLL_GPU * 8;
    const canvasPixels = 512 * 512;

    for (let i = 0; i < testFrames; i++) {
      gl.uniform1i(u_loops_loc, targetLoops);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      let t0 = performance.now();
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      totalTime += performance.now() - t0;
      totalOps += canvasPixels * opsPerPixel;

      await yieldToBrowser();
    }

    // Cleanup WebGL resources cleanly
    gl.deleteProgram(program);
    gl.deleteBuffer(positionBuffer);

    updateScore('res-gpu', totalOps / (totalTime / 1000) / 1e9, 10000);
    log(`✓ GPU complete. (Sanity check: rgba(${pixel.join(',')}))`);
  }

  // --- 4. MEMORY BANDWIDTH (RAM) ---
  async function runMemory() {
    const el = /** @type {HTMLElement} */ (document.getElementById('res-mem'));
    el.innerText = 'Calculating...';
    await yieldToBrowser();

    // 16 Million Float64s = 128 MB. Massively exceeds L3 Cache to force RAM bottleneck.
    const sizeElements = 16 * 1024 * 1024;
    const src = new Float64Array(sizeElements);
    const dst = new Float64Array(sizeElements);

    // Prevent clever page-fault zero-fill optimizations by dirtying the source
    for (let i = 0; i < sizeElements; i += 4096) {
      src[i] = Math.random();
    }

    // Warmup JIT & OS memory paging
    for (let i = 0; i < 3; i++) {
      dst.set(src);
    }

    let totalTime = 0;
    let totalBytesMoved = 0;
    const testDuration = 1500; // 1.5 seconds

    const startTest = performance.now();
    while (performance.now() - startTest < testDuration) {
      let t0 = performance.now();
      for (let i = 0; i < 5; i++) {
        // .set() maps natively to fast memcpy/memmove inside V8/JSC
        dst.set(src);
        src[0] = performance.now(); // Mutate slightly
      }
      let t1 = performance.now();

      totalTime += t1 - t0;
      // Reading 128MB, writing 128MB = 256MB moved per copy * 5 copies
      totalBytesMoved += sizeElements * 8 * 2 * 5;

      await yieldToBrowser();
    }

    const gbPerSec = totalBytesMoved / 1e9 / (totalTime / 1000);
    updateScore('res-mem', gbPerSec, 100, 'GB/s');
    log(
      `✓ Memory bandwidth complete. (${(totalBytesMoved / 1e9).toFixed(1)} GB moved)`,
    );
  }

  // --- Orchestrator ---
  let isRunning = false;
  async function runAllBenchmarks() {
    if (isRunning) return;
    isRunning = true;

    // Reset UI for consecutive runs
    const btn = /** @type {HTMLButtonElement} */ (
      document.getElementById('btn-run')
    );
    const statusText = document.getElementById('status-text');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Running...';
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }
    if (statusText)
      statusText.innerText = 'Running automated hardware benchmarks...';

    ['res-single', 'res-multi', 'res-gpu', 'res-mem'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerText = 'Queued...';
        if (el.parentElement) el.parentElement.style.setProperty('--pct', '0%');
      }
    });

    const sEl = document.getElementById('res-score');
    if (sEl) sEl.innerText = 'Calculating...';

    logElement.innerHTML = 'Logs:<br>';

    await runSingleCore();
    await yieldToBrowser();
    await runMultiCore();
    await yieldToBrowser();
    await runGPU();
    await yieldToBrowser();
    await runMemory();
    log('<br><b>All benchmarks finished.</b>');

    // Hardware Context Guessing
    const singleEl = document.getElementById('res-single');
    const multiEl = document.getElementById('res-multi');
    const gpuEl = document.getElementById('res-gpu');
    const memEl = document.getElementById('res-mem');

    const single = singleEl ? parseFloat(singleEl.innerText) || 0 : 0;
    const multi = multiEl ? parseFloat(multiEl.innerText) || 0 : 0;
    const gpu = gpuEl ? parseFloat(gpuEl.innerText) || 0 : 0;
    const mem = memEl ? parseFloat(memEl.innerText) || 0 : 0;

    // Weighting the Compute Index
    // Single-Core governs browser UI responsiveness
    // Multi-Core measures raw concurrent parallel throughput
    // GPU outputs huge relative GFLOPS; normalized (0.25) to prevent dwarfing CPU metrics
    // RAM Bandwidth mitigates physical L3 cache starvation limits
    const computeIndex = Math.round(
      single * 50 + multi * 10 + gpu * 0.25 + mem * 10,
    );

    const scoreEl = document.getElementById('res-score');
    if (scoreEl) {
      scoreEl.innerText = computeIndex.toLocaleString();
    }

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

  // Start immediately
  runAllBenchmarks();
});
