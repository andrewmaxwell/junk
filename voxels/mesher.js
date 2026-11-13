// Turns one 32³ chunk into a mesh: a quad for every filled cell's face that touches an empty
// cell. Each vertex carries the cell's state, the step it was last visited, and how open its
// corner is (per-vertex ambient occlusion, as in
// https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/). The shader in
// main.js turns those into a colour.
import {CHUNK} from './turmite.js';

const P = CHUNK + 2; // padded with a one-cell border from the neighbouring chunks
const padded = new Uint8Array(P ** 3);
const STRIDE = [1, P * P, P]; // index step along x, y, z: index = (y * P + z) * P + x

const AO = [0.3, 0.55, 0.78, 1]; // brightness by how open a corner is (0 = most hemmed in)

// For each of the six faces: the index offset to the cell in front of it, its normal, and for
// each of its four corners (counter-clockwise seen from outside) the corner's position and the
// offsets to the two edge cells and the diagonal cell that can hem it in.
const faces = [];
for (let d = 0; d < 3; d++)
  for (const sign of [-1, 1]) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const front = sign * STRIDE[d];
    const normal = [0, 0, 0];
    normal[d] = sign * 127;
    const order = sign > 0 ? [0, 1, 3, 2] : [0, 2, 3, 1]; // e_u × e_v = e_d
    const corners = order.map((k) => {
      const cu = k & 1;
      const cv = k >> 1;
      const p = [0, 0, 0];
      if (sign > 0) p[d] = 1;
      p[u] = cu;
      p[v] = cv;
      const su = (cu ? 1 : -1) * STRIDE[u];
      const sv = (cv ? 1 : -1) * STRIDE[v];
      return {
        p,
        side1: front + su,
        side2: front + sv,
        diagonal: front + su + sv,
      };
    });
    faces.push({front, normal, corners});
  }

// Scratch space for the worst case, a 3D checkerboard: half the cells, six faces each.
const MAX_QUADS = (CHUNK ** 3 / 2) * 6;
const pos = new Uint8Array(MAX_QUADS * 12);
const nor = new Int8Array(MAX_QUADS * 12);
const vox = new Float32Array(MAX_QUADS * 12); // state, age, openness
const idx = new Uint32Array(MAX_QUADS * 6);
const ao = [0, 0, 0, 0];

const fillPadded = (turmite, chunk) => {
  const {cx, cy, cz, data} = chunk;
  const ox = cx * CHUNK - 1;
  const oy = cy * CHUNK - 1;
  const oz = cz * CHUNK - 1;
  for (let y = 0; y < P; y++)
    for (let z = 0; z < P; z++) {
      const row = (y * P + z) * P;
      if (y > 0 && y <= CHUNK && z > 0 && z <= CHUNK) {
        const from = ((y - 1) << 10) | ((z - 1) << 5);
        padded.set(data.subarray(from, from + CHUNK), row + 1);
        padded[row] = turmite.get(ox, oy + y, oz + z);
        padded[row + P - 1] = turmite.get(ox + P - 1, oy + y, oz + z);
      } else
        for (let x = 0; x < P; x++)
          padded[row + x] = turmite.get(ox + x, oy + y, oz + z);
    }
};

export const meshChunk = (turmite, chunk) => {
  fillPadded(turmite, chunk);
  const {age} = chunk;
  let quads = 0;
  for (let y = 0; y < CHUNK; y++)
    for (let z = 0; z < CHUNK; z++) {
      const row = ((y + 1) * P + z + 1) * P + 1;
      for (let x = 0; x < CHUNK; x++) {
        const s = padded[row + x];
        if (!s) continue;
        const i = row + x;
        const when = age[(y << 10) | (z << 5) | x];
        for (let f = 0; f < 6; f++) {
          const face = faces[f];
          if (padded[i + face.front]) continue;
          const {normal, corners} = face;
          let o = quads * 12;
          for (let k = 0; k < 4; k++) {
            const c = corners[k];
            const s1 = padded[i + c.side1] ? 1 : 0;
            const s2 = padded[i + c.side2] ? 1 : 0;
            const open =
              s1 && s2 ? 0 : 3 - s1 - s2 - (padded[i + c.diagonal] ? 1 : 0);
            ao[k] = open;
            pos[o] = x + c.p[0];
            pos[o + 1] = y + c.p[1];
            pos[o + 2] = z + c.p[2];
            nor[o] = normal[0];
            nor[o + 1] = normal[1];
            nor[o + 2] = normal[2];
            vox[o] = s;
            vox[o + 1] = when;
            vox[o + 2] = AO[open];
            o += 3;
          }
          // split the quad along the diagonal that keeps the shading smooth
          const b = quads * 4;
          const j = quads * 6;
          const turn = ao[0] + ao[2] > ao[1] + ao[3] ? 0 : 1;
          idx[j] = b + turn;
          idx[j + 1] = b + turn + 1;
          idx[j + 2] = b + turn + 2;
          idx[j + 3] = b + turn;
          idx[j + 4] = b + turn + 2;
          idx[j + 5] = b + ((turn + 3) & 3);
          quads++;
        }
      }
    }
  return {
    quads,
    position: pos.slice(0, quads * 12),
    normal: nor.slice(0, quads * 12),
    voxel: vox.slice(0, quads * 12),
    index:
      quads * 4 <= 65536
        ? new Uint16Array(idx.subarray(0, quads * 6))
        : idx.slice(0, quads * 6),
  };
};
