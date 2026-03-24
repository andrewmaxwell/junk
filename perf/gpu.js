import {log, yieldToBrowser, updateScore} from './ui.js';

export async function runGPU() {
  const el = /** @type {HTMLElement} */ (document.getElementById('res-gpu'));
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;

  const gl = canvas.getContext('webgl2', {
    powerPreference: 'high-performance',
  });

  if (!gl) {
    if (el) el.innerText = 'WebGL2 Not Supported';
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

  const fsSource = `#version 300 es
    precision highp float;
    uniform int u_loops;
    out vec4 outColor;
    void main() {
      float v1 = 1.1, v2 = 1.2, v3 = 1.3, v4 = 1.4;
      float a = -0.9999 - (gl_FragCoord.x * 0.0000001);
      float b = 2.5 + (gl_FragCoord.y * 0.0000001);
      
      for(int i = 0; i < u_loops; i++) {
        ${gpuMathCore}
      }
      
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
  if (!program) throw new Error('Could not create program');

  const vsShader = compile(gl.VERTEX_SHADER, vsSource);
  const fsShader = compile(gl.FRAGMENT_SHADER, fsSource);

  gl.attachShader(program, vsShader);
  gl.attachShader(program, fsShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  // Automatically queue attached GLSL strings for garbage collection explicitly natively
  gl.deleteShader(vsShader);
  gl.deleteShader(fsShader);

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

  let loops = 20;
  let timeMs = 0;

  while (true) {
    gl.uniform1i(u_loops_loc, loops);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    let t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    timeMs = performance.now() - t0;
    if (timeMs > 30) break;

    loops *= 4;
    if (loops > 200000) {
      loops = 200000;
      break;
    }
  }

  const targetLoops = Math.max(
    1,
    Math.min(500000, Math.floor(loops * (250 / Math.max(timeMs, 1)))),
  );

  let totalTime = 0;
  let totalOps = 0;
  const testDuration = 1500;
  const opsPerPixel = targetLoops * UNROLL_GPU * 8;
  const canvasPixels = 512 * 512;
  const startTest = performance.now();

  while (performance.now() - startTest < testDuration) {
    gl.uniform1i(u_loops_loc, targetLoops);
    // Block CPU until VRAM layout synchronizes
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    let t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // Block CPU until execution pipeline renders
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    totalTime += performance.now() - t0;
    totalOps += canvasPixels * opsPerPixel;

    await yieldToBrowser();
  }

  gl.deleteProgram(program);
  gl.deleteBuffer(positionBuffer);

  // Safely release context bounds immediately dropping 256MB+ canvas caches
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) ext.loseContext();

  updateScore('res-gpu', totalOps / (totalTime / 1000) / 1e9, 10000);
  log(`✓ GPU complete. (Sanity check: rgba(${pixel.join(',')}))`);
}
