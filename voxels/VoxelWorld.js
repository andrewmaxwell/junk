const mod = (n, m) => ((n % m) + m) % m;

const faces = [
  {
    // left
    uvRow: 0,
    dir: [-1, 0, 0],
    corners: [
      {pos: [0, 1, 0], uv: [0, 1]},
      {pos: [0, 0, 0], uv: [0, 0]},
      {pos: [0, 1, 1], uv: [1, 1]},
      {pos: [0, 0, 1], uv: [1, 0]},
    ],
  },
  {
    // right
    uvRow: 0,
    dir: [1, 0, 0],
    corners: [
      {pos: [1, 1, 1], uv: [0, 1]},
      {pos: [1, 0, 1], uv: [0, 0]},
      {pos: [1, 1, 0], uv: [1, 1]},
      {pos: [1, 0, 0], uv: [1, 0]},
    ],
  },
  {
    // bottom
    uvRow: 1,
    dir: [0, -1, 0],
    corners: [
      {pos: [1, 0, 1], uv: [1, 0]},
      {pos: [0, 0, 1], uv: [0, 0]},
      {pos: [1, 0, 0], uv: [1, 1]},
      {pos: [0, 0, 0], uv: [0, 1]},
    ],
  },
  {
    // top
    uvRow: 2,
    dir: [0, 1, 0],
    corners: [
      {pos: [0, 1, 1], uv: [1, 1]},
      {pos: [1, 1, 1], uv: [0, 1]},
      {pos: [0, 1, 0], uv: [1, 0]},
      {pos: [1, 1, 0], uv: [0, 0]},
    ],
  },
  {
    // back
    uvRow: 0,
    dir: [0, 0, -1],
    corners: [
      {pos: [1, 0, 0], uv: [0, 0]},
      {pos: [0, 0, 0], uv: [1, 0]},
      {pos: [1, 1, 0], uv: [0, 1]},
      {pos: [0, 1, 0], uv: [1, 1]},
    ],
  },
  {
    // front
    uvRow: 0,
    dir: [0, 0, 1],
    corners: [
      {pos: [0, 0, 1], uv: [0, 0]},
      {pos: [1, 0, 1], uv: [1, 0]},
      {pos: [0, 1, 1], uv: [0, 1]},
      {pos: [1, 1, 1], uv: [1, 1]},
    ],
  },
];

export class VoxelWorld {
  constructor({chunkSize, tileSize, tileTextureWidth, tileTextureHeight}) {
    this.chunkSize = chunkSize;
    this.tileSize = tileSize;
    this.tileTextureWidth = tileTextureWidth;
    this.tileTextureHeight = tileTextureHeight;
    this.chunkSliceSize = chunkSize * chunkSize;
    this.chunks = {};
  }
  #computeVoxelOffset(x, y, z) {
    const {chunkSize, chunkSliceSize} = this;
    const voxelX = mod(x, chunkSize) | 0;
    const voxelY = mod(y, chunkSize) | 0;
    const voxelZ = mod(z, chunkSize) | 0;
    return voxelY * chunkSliceSize + voxelZ * chunkSize + voxelX;
  }
  #addChunkForVoxel(x, y, z) {
    const chunkId = this.computeChunkId(x, y, z);
    let chunk = this.chunks[chunkId];
    if (!chunk) {
      const {chunkSize} = this;
      chunk = new Uint8Array(chunkSize * chunkSize * chunkSize);
      this.chunks[chunkId] = chunk;
    }
    return chunk;
  }
  #getChunkForVoxel(x, y, z) {
    return this.chunks[this.computeChunkId(x, y, z)];
  }
  #getVoxel(x, y, z) {
    const chunk = this.#getChunkForVoxel(x, y, z);
    if (!chunk) return 0;

    const voxelOffset = this.#computeVoxelOffset(x, y, z);
    return chunk[voxelOffset];
  }

  computeChunkId(x, y, z) {
    const {chunkSize} = this;
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);
    return `${chunkX},${chunkY},${chunkZ}`;
  }
  setVoxel(x, y, z, v, addChunk = true) {
    let chunk = this.#getChunkForVoxel(x, y, z);
    if (!chunk) {
      if (!addChunk) return;
      chunk = this.#addChunkForVoxel(x, y, z);
    }

    const voxelOffset = this.#computeVoxelOffset(x, y, z);
    chunk[voxelOffset] = v;
  }
  generateGeometryDataForChunk(chunkX, chunkY, chunkZ) {
    const {chunkSize, tileSize, tileTextureWidth, tileTextureHeight} = this;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const startX = chunkX * chunkSize;
    const startY = chunkY * chunkSize;
    const startZ = chunkZ * chunkSize;

    for (let y = 0; y < chunkSize; ++y) {
      const voxelY = startY + y;
      for (let z = 0; z < chunkSize; ++z) {
        const voxelZ = startZ + z;
        for (let x = 0; x < chunkSize; ++x) {
          const voxelX = startX + x;
          const voxel = this.#getVoxel(voxelX, voxelY, voxelZ);
          if (!voxel) continue;

          // voxel 0 is sky (empty) so for UVs we start at 0
          const uvVoxel = voxel - 1;
          // There is a voxel here but do we need faces for it?
          for (const {dir, corners, uvRow} of faces) {
            const neighbor = this.#getVoxel(
              voxelX + dir[0],
              voxelY + dir[1],
              voxelZ + dir[2]
            );
            if (neighbor) continue;
            // this voxel has no neighbor in this direction so we need a face.
            const ndx = positions.length / 3;
            for (const {pos, uv} of corners) {
              positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
              normals.push(...dir);
              uvs.push(
                ((uvVoxel + uv[0]) * tileSize) / tileTextureWidth,
                1 - ((uvRow + 1 - uv[1]) * tileSize) / tileTextureHeight
              );
            }

            indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
          }
        }
      }
    }

    return {positions, normals, uvs, indices};
  }
  // https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.42.3443&rep=rep1&type=pdf
  intersectRay(start, end) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let dz = end.z - start.z;
    const len = Math.hypot(dx, dy, dz);

    dx /= len;
    dy /= len;
    dz /= len;

    let t = 0;
    let ix = Math.floor(start.x);
    let iy = Math.floor(start.y);
    let iz = Math.floor(start.z);

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);

    const txDelta = Math.abs(1 / dx);
    const tyDelta = Math.abs(1 / dy);
    const tzDelta = Math.abs(1 / dz);

    const xDist = stepX > 0 ? ix + 1 - start.x : start.x - ix;
    const yDist = stepY > 0 ? iy + 1 - start.y : start.y - iy;
    const zDist = stepZ > 0 ? iz + 1 - start.z : start.z - iz;

    // location of nearest voxel boundary, in units of t
    let txMax = txDelta < Infinity ? txDelta * xDist : Infinity;
    let tyMax = tyDelta < Infinity ? tyDelta * yDist : Infinity;
    let tzMax = tzDelta < Infinity ? tzDelta * zDist : Infinity;

    let steppedIndex = -1;

    // main loop along raycast vector
    while (t <= len) {
      const voxel = this.#getVoxel(ix, iy, iz);
      if (voxel) {
        return {
          position: [start.x + t * dx, start.y + t * dy, start.z + t * dz],
          normal: [
            steppedIndex === 0 ? -stepX : 0,
            steppedIndex === 1 ? -stepY : 0,
            steppedIndex === 2 ? -stepZ : 0,
          ],
          voxel,
        };
      }

      // advance t to next nearest voxel boundary
      if (txMax < tyMax) {
        if (txMax < tzMax) {
          ix += stepX;
          t = txMax;
          txMax += txDelta;
          steppedIndex = 0;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      } else {
        if (tyMax < tzMax) {
          iy += stepY;
          t = tyMax;
          tyMax += tyDelta;
          steppedIndex = 1;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      }
    }

    return null;
  }
}
