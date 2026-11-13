// A 3D turmite: Langton's ant generalised to a cubic grid. The ant knows which way it faces and
// which way is up. Each step it reads the state of its cell, turns according to that state's
// letter in the rule, advances the cell to the next state, and steps forward.
//
//   L/R  turn left/right (yaw)     U/D  pitch up/down     N  no turn     B  turn back
//
// A rule of only L and R keeps the ant in a plane, so "RL" is exactly 2D Langton's ant.
// Cells live in 32³ chunks of bytes, keyed by chunk coordinate, so the grid is unbounded.

export const CHUNK = 32;
const BITS = 5;
const MASK = CHUNK - 1;
const OFF = 1 << 10; // chunk coordinates from -1024 to 1023, i.e. ±32768 cells

export const chunkKey = (cx, cy, cz) =>
  ((cx + OFF) * 2048 + (cy + OFF)) * 2048 + (cz + OFF);

export const MAX_STATES = 12;

// Uppercases and drops anything that isn't a turn. Returns null if it isn't a usable rule.
export const parseRule = (text) => {
  const rule = String(text)
    .toUpperCase()
    .replace(/[^LRUDNB]/g, '');
  return rule.length >= 2 && rule.length <= MAX_STATES ? rule : null;
};

export class Turmite {
  constructor(rule) {
    this.rule = rule;
    this.states = rule.length;
    this.codes = Int8Array.from(rule, (c) => 'LRUDNB'.indexOf(c));
    this.chunks = new Map(); // key -> {cx, cy, cz, data: Uint8Array, dirty}
    this.dirty = []; // chunks whose mesh is out of date
    this.x = this.y = this.z = 0;
    [this.hx, this.hy, this.hz] = [1, 0, 0]; // heading
    [this.ux, this.uy, this.uz] = [0, 1, 0]; // up
    this.steps = 0;
    this.filled = 0; // cells in a non-zero state
    this.min = [0, 0, 0];
    this.max = [0, 0, 0];
    this.cache = null; // the chunk the ant was last in
  }

  chunkAt(cx, cy, cz, create) {
    const key = chunkKey(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (!chunk && create) {
      chunk = {cx, cy, cz, data: new Uint8Array(CHUNK ** 3), dirty: false};
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  get(x, y, z) {
    const chunk = this.chunkAt(x >> BITS, y >> BITS, z >> BITS, false);
    return chunk
      ? chunk.data[((y & MASK) << 10) | ((z & MASK) << 5) | (x & MASK)]
      : 0;
  }

  markDirty(chunk) {
    if (chunk && !chunk.dirty) {
      chunk.dirty = true;
      this.dirty.push(chunk);
    }
  }

  // A cell on a chunk's face also shapes the faces and shading of the neighbouring chunks.
  markNeighbours(x, y, z) {
    const range = (v) => {
      const c = v >> BITS;
      const l = v & MASK;
      return l === 0 ? [c - 1, c] : l === MASK ? [c, c + 1] : [c];
    };
    for (const cx of range(x))
      for (const cy of range(y))
        for (const cz of range(z)) this.markDirty(this.chunkAt(cx, cy, cz));
  }

  run(n) {
    const {codes, states, min, max} = this;
    let {x, y, z, hx, hy, hz, ux, uy, uz, cache} = this;
    let filled = this.filled;
    for (let i = 0; i < n; i++) {
      const cx = x >> BITS;
      const cy = y >> BITS;
      const cz = z >> BITS;
      if (!cache || cache.cx !== cx || cache.cy !== cy || cache.cz !== cz)
        cache = this.chunkAt(cx, cy, cz, true);
      const idx = ((y & MASK) << 10) | ((z & MASK) << 5) | (x & MASK);
      const s = cache.data[idx];
      const next = s + 1 === states ? 0 : s + 1;
      cache.data[idx] = next;

      if (next === 0) filled--;
      else if (s === 0) {
        filled++;
        if (x < min[0]) min[0] = x;
        if (y < min[1]) min[1] = y;
        if (z < min[2]) min[2] = z;
        if (x > max[0]) max[0] = x;
        if (y > max[1]) max[1] = y;
        if (z > max[2]) max[2] = z;
      }
      if (!cache.dirty) this.markDirty(cache);
      // Only emptiness matters to neighbouring chunks. (v + 1) & MASK < 2 means v is on a face.
      const edge =
        ((x + 1) & MASK) < 2 || ((y + 1) & MASK) < 2 || ((z + 1) & MASK) < 2;
      if (edge && (s === 0 || next === 0)) this.markNeighbours(x, y, z);

      // right = heading × up
      const rx = hy * uz - hz * uy;
      const ry = hz * ux - hx * uz;
      const rz = hx * uy - hy * ux;
      switch (codes[s]) {
        case 0: // L
          hx = -rx;
          hy = -ry;
          hz = -rz;
          break;
        case 1: // R
          hx = rx;
          hy = ry;
          hz = rz;
          break;
        case 2: {
          // U: nose up, so the old heading is now down
          const [ox, oy, oz] = [hx, hy, hz];
          hx = ux;
          hy = uy;
          hz = uz;
          ux = -ox;
          uy = -oy;
          uz = -oz;
          break;
        }
        case 3: {
          // D
          const [ox, oy, oz] = [hx, hy, hz];
          hx = -ux;
          hy = -uy;
          hz = -uz;
          ux = ox;
          uy = oy;
          uz = oz;
          break;
        }
        case 5: // B
          hx = -hx;
          hy = -hy;
          hz = -hz;
          break;
      }
      x += hx;
      y += hy;
      z += hz;
    }
    Object.assign(this, {x, y, z, hx, hy, hz, ux, uy, uz, cache, filled});
    this.steps += n;
  }

  takeDirty() {
    const list = this.dirty;
    this.dirty = [];
    for (const chunk of list) chunk.dirty = false;
    return list;
  }
}
