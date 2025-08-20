// Renderer.js
// Rendering only: camera smoothing, clearing, z-buffered plotting, presenting.

/** @import {Sim} from './Sim.js' */

import {qDot, newtonSqrtRet, X, Y, Z} from './utils.js';

const RPM_SCALE = 36476;

export class Renderer {
  constructor(width, height) {
    this.W = width;
    this.H = height;

    this.buf = new Uint16Array(width * height);
    this.depth = new Float32Array(width * height);

    // Camera lives here
    this.cam = 0;

    this.pre = document.createElement('pre');
    this.pre.style.margin = '0';
    this.pre.style.lineHeight = '1.0';
    this.pre.style.fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    document.body.appendChild(this.pre);
  }

  #clearWithCurrentCam() {
    const {W, H, buf, depth} = this;
    const total = W * H;
    const cam = this.cam | 0; // identical truncation behavior
    for (let idx = total; idx--; ) {
      const a = (idx + cam) | 0;
      buf[idx] = idx > total - W ? (a & 16) + 45 : idx % W ? 32 : 10;
      depth[idx] = -Infinity; // reset z-buffer so nearest (max z) wins
    }
  }

  #bufferToString() {
    const {buf} = this;
    let s = '';
    const CHUNK = 4096;
    for (let i = 0; i < buf.length; i += CHUNK) {
      const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
      s += String.fromCharCode.apply(null, slice);
    }
    return s;
  }

  #present(rpmValue) {
    const rpmRounded = Math.round(rpmValue);
    const rpmStr = String(rpmRounded);
    const padding = Math.max(0, this.W - 5 - rpmStr.length);
    this.pre.textContent =
      this.#bufferToString() + '\n' + ' '.repeat(padding) + rpmStr + ' rpm';
  }

  /**
   * Clear, project, z-buffer draw, camera-smooth, and present for this frame.
   * Uses current sim state (no vPrev / lastAccZ needed).
   * '@' vs '.' is chosen by comparing v[Z] against sim.acc[Z],
   * while the z-buffer ensures nearer points win deterministically.
   * @param {Sim} sim
   */
  render(sim) {
    const {W, H, depth, buf} = this;

    // 1) Clear background and reset depth
    this.#clearWithCurrentCam();

    // 2) Project & z-buffer
    const cam = this.cam;
    const threshZ = sim.acc.a[Z]; // shading threshold (front vs behind), current state

    for (let pi = 0; pi < sim.count; pi++) {
      const node = sim.particles[pi];
      if (!node || !node.m) continue;
      const v = node.v.a;

      const row = (H - 1.5 - v[X]) | 0;
      const col = (0.5 + (v[Y] - cam) * 2 + W / 2) | 0;
      if (row <= 0 || row >= H || col <= 0 || col >= W) continue;

      const idx = (W * row + col) | 0;
      const z = v[Z];

      // Nearest-wins: keep the point with the largest z (closest to viewer)
      if (z >= depth[idx]) {
        depth[idx] = z;
        buf[idx] = z < threshZ ? 58 : 64; // '.' if "behind", '@' if "front"
      }
    }

    // 3) RPM line from current spin (same math the C prints)
    const rpmValue = newtonSqrtRet(qDot(sim.spin, sim.spin) * RPM_SCALE);

    // 4) Camera smoothing (update for next frame)
    this.cam += (sim.acc.a[Y] - this.cam) / 50;

    // 5) Present composed frame
    this.#present(rpmValue);
  }
}
