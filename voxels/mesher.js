// Turns one 32³ chunk into a mesh: a quad for every filled cell's face that touches an empty
// cell, coloured by the cell's state and darkened at corners hemmed in by neighbours
// (per-vertex ambient occlusion, as in https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/).
import {CHUNK} from './turmite.js';

const P = CHUNK + 2; // padded with a one-cell border from the neighbouring chunks
const padded = new Uint8Array(P ** 3);
const at = (x, y, z) => (y * P + z) * P + x; // x, y, z from -1 to CHUNK, shifted by one

const AO = [0.3, 0.55, 0.78, 1]; // brightness by how open a corner is (0 = most hemmed in)

// Scratch space for the worst case, a 3D checkerboard: half the cells, six faces each.
const MAX_QUADS = (CHUNK ** 3 / 2) * 6;
const pos = new Uint8Array(MAX_QUADS * 12);
const nor = new Int8Array(MAX_QUADS * 12);
const col = new Uint8Array(MAX_QUADS * 12);
const idx = new Uint32Array(MAX_QUADS * 6);

const fillPadded = (turmite, chunk) => {
  const {cx, cy, cz, data} = chunk;
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  const oz = cz * CHUNK;
  for (let y = -1; y <= CHUNK; y++)
    for (let z = -1; z <= CHUNK; z++) {
      const inner = y >= 0 && y < CHUNK && z >= 0 && z < CHUNK;
      for (let x = -1; x <= CHUNK; x++) {
        padded[at(x + 1, y + 1, z + 1)] =
          inner && x >= 0 && x < CHUNK
            ? data[(y << 10) | (z << 5) | x]
            : turmite.get(ox + x, oy + y, oz + z);
      }
    }
};

// palette[state] = [r, g, b] in 0..255, linear
export const meshChunk = (turmite, chunk, palette) => {
  fillPadded(turmite, chunk);
  let quads = 0;
  const c = [0, 0, 0];
  for (let y = 0; y < CHUNK; y++)
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const s = padded[at(x + 1, y + 1, z + 1)];
        if (!s) continue;
        const rgb = palette[s];
        for (let d = 0; d < 3; d++) {
          const u = (d + 1) % 3;
          const v = (d + 2) % 3;
          for (let sign = -1; sign <= 1; sign += 2) {
            // the cell in front of this face, in padded coordinates
            c[0] = x + 1;
            c[1] = y + 1;
            c[2] = z + 1;
            c[d] += sign;
            if (padded[at(c[0], c[1], c[2])]) continue;

            const solid = (du, dv) => {
              const q = [c[0], c[1], c[2]];
              q[u] += du;
              q[v] += dv;
              return padded[at(q[0], q[1], q[2])] ? 1 : 0;
            };
            const base = quads * 4;
            const ao = [0, 0, 0, 0];
            // corners counter-clockwise seen from outside: e_u × e_v = e_d
            const corners =
              sign > 0
                ? [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                  ]
                : [
                    [0, 0],
                    [0, 1],
                    [1, 1],
                    [1, 0],
                  ];
            for (let k = 0; k < 4; k++) {
              const [cu, cv] = corners[k];
              const su = cu ? 1 : -1;
              const sv = cv ? 1 : -1;
              const s1 = solid(su, 0);
              const s2 = solid(0, sv);
              const a = s1 && s2 ? 0 : 3 - s1 - s2 - solid(su, sv);
              ao[k] = a;
              const o = (base + k) * 3;
              const p = [x, y, z];
              if (sign > 0) p[d] += 1;
              p[u] += cu;
              p[v] += cv;
              pos[o] = p[0];
              pos[o + 1] = p[1];
              pos[o + 2] = p[2];
              nor[o] = nor[o + 1] = nor[o + 2] = 0;
              nor[o + d] = sign * 127;
              const b = AO[a];
              col[o] = rgb[0] * b;
              col[o + 1] = rgb[1] * b;
              col[o + 2] = rgb[2] * b;
            }
            // split the quad along the diagonal that keeps the shading smooth
            const i = quads * 6;
            if (ao[0] + ao[2] > ao[1] + ao[3]) {
              idx.set([base, base + 1, base + 2, base, base + 2, base + 3], i);
            } else {
              idx.set(
                [base + 1, base + 2, base + 3, base + 1, base + 3, base],
                i,
              );
            }
            quads++;
          }
        }
      }
  return {
    quads,
    position: pos.slice(0, quads * 12),
    normal: nor.slice(0, quads * 12),
    color: col.slice(0, quads * 12),
    index:
      quads * 4 <= 65536
        ? Uint16Array.from(idx.subarray(0, quads * 6))
        : idx.slice(0, quads * 6),
  };
};
