// A 3D turmite: Langton's ant generalised to a cubic grid. The ant knows which way it faces and
// which way is up. Each step it reads the state of its cell, turns according to that state's
// letter in the rule, advances the cell to the next state, and steps forward.
//
//   L/R  turn left/right (yaw)     U/D  pitch up/down     N  no turn     B  turn back
//
// A rule of only L and R keeps the ant in a plane, so "RL" is exactly 2D Langton's ant.
//
// There can be several ants, started near the origin as copies of the first under a symmetry of
// the cube. They all read their cells before any of them writes, so nothing depends on their
// order and the sculpture keeps that symmetry forever. A mirrored ant is left-handed: its L is a
// right turn.
//
// Cells live in 32³ chunks, keyed by chunk coordinate, so the grid is unbounded. Each cell has a
// state and the step at which an ant last left it (its age, 0 if never visited).

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

// The symmetries of the cube are the 48 matrices with one ±1 in each row and column.
const cubeGroup = [];
for (const perm of [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
  [0, 2, 1],
  [2, 1, 0],
  [1, 0, 2],
])
  for (let signs = 0; signs < 8; signs++) {
    const m = [0, 1, 2].map((row) =>
      [0, 1, 2].map((c) =>
        c === perm[row] ? (signs & (1 << row) ? -1 : 1) : 0,
      ),
    );
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    cubeGroup.push({m, det, diagonal: perm[0] === 0 && perm[1] === 1});
  }

// How many ants there can be, and the symmetries that make them from the first.
export const FORMATIONS = {
  1: (g) => g.diagonal && g.det === 1 && g.m[0][0] === 1 && g.m[1][1] === 1,
  2: (g) => g.diagonal && g.m[1][1] === 1 && g.m[2][2] === 1, // mirror in x
  4: (g) => g.diagonal && g.m[2][2] === 1, // mirrors in x and y
  8: (g) => g.diagonal, // mirrors in x, y and z
  24: (g) => g.det === 1, // every rotation of the cube
  48: () => true, // and their mirror images
};

const apply = (m, v) =>
  m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

export class Turmite {
  constructor(rule, ants = 1) {
    this.rule = rule;
    this.states = rule.length;
    this.codes = Int8Array.from(rule, (c) => 'LRUDNB'.indexOf(c));
    this.chunks = new Map(); // key -> {key, cx, cy, cz, data, age, dirty}
    this.dirty = []; // chunks whose mesh is out of date
    // One ant starts at the origin. Several start apart, each in its own cell: stacked on one
    // cell they would advance it together, which for many rules cancels out to nothing at all.
    const first = ants > 1 ? [3, 1, 2] : [0, 0, 0];
    this.ants = cubeGroup.filter(FORMATIONS[ants]).map(({m, det}) => {
      const [x, y, z] = apply(m, first);
      const [hx, hy, hz] = apply(m, [1, 0, 0]); // heading
      const [ux, uy, uz] = apply(m, [0, 1, 0]); // up
      // hand: 1, or -1 for a mirror image. chunk, idx and s are where it is and what it read.
      return {
        x,
        y,
        z,
        hx,
        hy,
        hz,
        ux,
        uy,
        uz,
        hand: det,
        chunk: null,
        idx: 0,
        s: 0,
      };
    });
    this.steps = 0;
    this.filled = 0; // cells in a non-zero state
    this.min = [Infinity, Infinity, Infinity]; // bounds of the filled cells
    this.max = [-Infinity, -Infinity, -Infinity];
  }

  chunkAt(cx, cy, cz, create) {
    const key = chunkKey(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (!chunk && create) {
      chunk = {
        key,
        cx,
        cy,
        cz,
        data: new Uint8Array(CHUNK ** 3),
        age: new Uint32Array(CHUNK ** 3),
        dirty: false,
      };
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
    const {ants, codes, states, min, max} = this;
    const count = ants.length;
    let filled = this.filled;
    for (let i = 0; i < n; i++) {
      const step = ++this.steps;

      // every ant reads its cell
      for (let a = 0; a < count; a++) {
        const ant = ants[a];
        const {x, y, z} = ant;
        const cx = x >> BITS;
        const cy = y >> BITS;
        const cz = z >> BITS;
        let chunk = ant.chunk;
        if (!chunk || chunk.cx !== cx || chunk.cy !== cy || chunk.cz !== cz)
          chunk = ant.chunk = this.chunkAt(cx, cy, cz, true);
        ant.idx = ((y & MASK) << 10) | ((z & MASK) << 5) | (x & MASK);
        ant.s = chunk.data[ant.idx];
      }

      // then every ant advances its cell, turns by what it read, and steps forward
      for (let a = 0; a < count; a++) {
        const ant = ants[a];
        const {x, y, z, chunk, idx} = ant;
        const was = chunk.data[idx]; // not ant.s if another ant shares the cell
        const next = was + 1 === states ? 0 : was + 1;
        chunk.data[idx] = next;
        chunk.age[idx] = step;

        if (next === 0) filled--;
        else if (was === 0) {
          filled++;
          if (x < min[0]) min[0] = x;
          if (y < min[1]) min[1] = y;
          if (z < min[2]) min[2] = z;
          if (x > max[0]) max[0] = x;
          if (y > max[1]) max[1] = y;
          if (z > max[2]) max[2] = z;
        }
        if (!chunk.dirty) this.markDirty(chunk);
        // Only emptiness matters to neighbouring chunks. (v + 1) & MASK < 2 means v is on a face.
        const edge =
          ((x + 1) & MASK) < 2 || ((y + 1) & MASK) < 2 || ((z + 1) & MASK) < 2;
        if (edge && (was === 0 || next === 0)) this.markNeighbours(x, y, z);

        const {hx, hy, hz, ux, uy, uz, hand} = ant;
        const code = codes[ant.s];
        if (code < 2) {
          // L or R: the new heading is the ant's right (heading × up, flipped for a mirror
          // image), or its left
          const side = code === 1 ? hand : -hand;
          ant.hx = side * (hy * uz - hz * uy);
          ant.hy = side * (hz * ux - hx * uz);
          ant.hz = side * (hx * uy - hy * ux);
        } else if (code < 4) {
          // U: nose up, so the old heading is now down. D is the opposite.
          const sign = code === 2 ? 1 : -1;
          ant.hx = sign * ux;
          ant.hy = sign * uy;
          ant.hz = sign * uz;
          ant.ux = -sign * hx;
          ant.uy = -sign * hy;
          ant.uz = -sign * hz;
        } else if (code === 5) {
          // B
          ant.hx = -hx;
          ant.hy = -hy;
          ant.hz = -hz;
        }
        ant.x = x + ant.hx;
        ant.y = y + ant.hy;
        ant.z = z + ant.hz;
      }
    }
    this.filled = filled;
  }

  takeDirty() {
    const list = this.dirty;
    this.dirty = [];
    for (const chunk of list) chunk.dirty = false;
    return list;
  }
}
