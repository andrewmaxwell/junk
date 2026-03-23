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

  // --- CPU Test Logic Generator ---
  // We generate the benchmark string dynamically to inject into Web Workers.
  // It calibrates the loop size and then runs for a target duration.
  /** @param {number} durationMs */
  const getCpuBenchmarkString = (durationMs) => `
    function calculateFlops() {
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
          // 4 statements x 2 ops = 8 ops per line. 16 lines = 128 ops per loop.
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
        }
        let t1 = performance.now();
        elapsed = t1 - t0;
        if (elapsed > 20) break; 
        N *= 2;
      }

      // Measurement Phase
      let totalTime = 0;
      let totalOps = 0;
      let baseOps = N * 128; // 128 ops per inner loop iteration
      
      let startTest = performance.now();
      while(performance.now() - startTest < ${durationMs}) {
        let t0 = performance.now();
        for(let i = 0; i < N; i++) {
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
        }
        let t1 = performance.now();
        totalTime += (t1 - t0);
        totalOps += baseOps; 
      }

      return { timeInSeconds: totalTime / 1000, ops: totalOps, sanity: v1 + v2 + v3 + v4 };
    }
  `;

  /** @param {number} durationMs */
  function runInWorker(durationMs) {
    return new Promise((resolve) => {
      const workerCode = `
        ${getCpuBenchmarkString(durationMs)}
        self.onmessage = function() {
          const result = calculateFlops();
          self.postMessage(result);
        };
      `;
      const blob = new Blob([workerCode], {type: 'application/javascript'});
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = function (e) {
        URL.revokeObjectURL(workerUrl);
        worker.terminate();
        resolve(e.data);
      };
      worker.postMessage('start');
    });
  }

  // --- 1. SINGLE CORE CPU (FP64) ---
  async function runSingleCore() {
    /** @type {HTMLElement} */ (
      document.getElementById('res-single')
    ).innerText = 'Calculating...';
    await yieldToBrowser();

    // Run for 1.5 seconds in a worker to keep UI responsive and get accurate measurement
    const result = await runInWorker(1500);

    const gflops = result.ops / result.timeInSeconds / 1e9;
    const el = document.getElementById('res-single');
    if (el) {
      el.innerText = `${gflops.toFixed(2)} GFLOPS`;
      if (el.parentElement) {
        el.parentElement.style.setProperty(
          '--pct',
          Math.min((gflops / 10) * 100, 100) + '%',
        );
      }
    }
    log(`✓ Single-Core complete. (Sanity check: ${result.sanity})`);
  }

  // --- 2. MULTI-CORE CPU (FP64) ---
  async function runMultiCore() {
    /** @type {HTMLElement} */ (
      document.getElementById('res-multi')
    ).innerText = 'Calculating...';
    await yieldToBrowser();

    const promises = [];
    // We run for 2.5 seconds to ensure all workers definitely overlap during their
    // performance.now() window, pushing thermal limits and concurrent capability.
    for (let i = 0; i < logicalCores; i++) {
      promises.push(runInWorker(2500));
    }

    const results = await Promise.all(promises);

    let combinedOpsPerSec = 0;
    let combinedSanity = 0;

    for (const res of results) {
      combinedOpsPerSec += res.ops / res.timeInSeconds;
      combinedSanity += res.sanity;
    }

    const gflops = combinedOpsPerSec / 1e9;
    const el = document.getElementById('res-multi');
    if (el) {
      el.innerText = `${gflops.toFixed(2)} GFLOPS`;
      if (el.parentElement) {
        el.parentElement.style.setProperty(
          '--pct',
          Math.min((gflops / 60) * 100, 100) + '%',
        );
      }
    }
    log(`✓ Multi-Core complete. (Combined sanity: ${combinedSanity})`);
  }

  // --- 3. GPU (FP32) via WebGL2 ---
  async function runGPU() {
    /** @type {HTMLElement} */ (document.getElementById('res-gpu')).innerText =
      'Calculating...';
    await yieldToBrowser();

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    // Request high-performance GPU if multiple exist (e.g. integrated vs discrete)
    const gl = canvas.getContext('webgl2', {
      powerPreference: 'high-performance',
    });

    if (!gl) {
      /** @type {HTMLElement} */ (
        document.getElementById('res-gpu')
      ).innerText = 'WebGL2 Not Supported';
      log('✗ GPU benchmark skipped (WebGL2 not available).');
      return;
    }

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
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
          v1=(v1*a)+b; v2=(v2*a)+b; v3=(v3*a)+b; v4=(v4*a)+b;
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
      let t1 = performance.now();

      timeMs = t1 - t0;
      if (timeMs > 30) break; // found a good stable chunk

      loops *= 4;
      if (loops > 200000) {
        loops = 200000; // safety ceiling
        break;
      }
    }

    // Scale chunk length to ~250ms for the actual benchmark
    let targetLoops = Math.floor(loops * (250 / Math.max(timeMs, 1)));
    if (targetLoops > 500000) targetLoops = 500000;
    if (targetLoops < 1) targetLoops = 1;

    let totalTime = 0;
    let totalOps = 0;
    const testFrames = 6; // 6 * 250ms = 1.5 seconds total runtime

    for (let i = 0; i < testFrames; i++) {
      gl.uniform1i(u_loops_loc, targetLoops);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      let t0 = performance.now();
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      let t1 = performance.now();

      totalTime += t1 - t0;

      // 512x512 pixels = 262144
      // targetLoops * 10 lines * 4 statements * 2 ops = targetLoops * 80 ops per pixel
      totalOps += 262144 * targetLoops * 80;

      await yieldToBrowser();
    }

    const gflops = totalOps / (totalTime / 1000) / 1e9;
    const resGpu = document.getElementById('res-gpu');
    if (resGpu) {
      resGpu.innerText = `${gflops.toFixed(2)} GFLOPS`;
      if (resGpu.parentElement) {
        resGpu.parentElement.style.setProperty(
          '--pct',
          Math.min((gflops / 10000) * 100, 100) + '%',
        );
      }
    }
    log(`✓ GPU complete. (Sanity check: rgba(${pixel.join(',')}))`);
  }

  // --- Orchestrator ---
  async function runAllBenchmarks() {
    await runSingleCore();
    await yieldToBrowser();
    await runMultiCore();
    await yieldToBrowser();
    await runGPU();
    log('<br><b>All benchmarks finished.</b>');

    // Hardware Context Guessing
    const multiEl = document.getElementById('res-multi');
    const gpuEl = document.getElementById('res-gpu');

    const multi = multiEl ? parseFloat(multiEl.innerText) || 0 : 0;
    const gpu = gpuEl ? parseFloat(gpuEl.innerText) || 0 : 0;

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

    log(`<span style="color: #4ec9b0">↳ CPU Class: ${cpuMatch}</span>`);
    if (gpu > 0)
      log(`<span style="color: #4ec9b0">↳ GPU Class: ${gpuMatch}</span>`);
  }

  // Start immediately
  runAllBenchmarks();
});
