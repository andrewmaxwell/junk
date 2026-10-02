/*
Spatial grid with cells the size of the interaction radius, so everything
within reach of a particle is in its own cell or one of the 8 around it.

sort() is a counting sort: it groups the particles by cell and reorders the
caller's particle arrays to match, so each cell's particles end up next to
each other at indices cellStart[cell] to cellStart[cell + 1]. Neighbors then
come from 3 contiguous ranges (one per row of the 3x3 block) instead of lists
of indices, and they sit together in memory, which is most of the speedup.

Particle indices change on every sort, so don't hold on to one across it.
*/
export default class Grid {
  constructor(rad, width, height) {
    this.rows = Math.ceil(height / rad);
    this.cols = Math.ceil(width / rad);
    this.rad = rad;
    const numCells = this.rows * this.cols;
    this.cellStart = new Int32Array(numCells + 1);
    this.cursor = new Int32Array(numCells);
    this.cellOf = new Int32Array(0);
    this.order = new Int32Array(0);
    this.scratch = new Map(); // one per typed array type, for reordering
    this.blocks = Array.from({length: numCells}, () => []);
  }

  // particles off the grid count as being in the nearest edge cell
  col(x) {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.rad)));
  }
  row(y) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.rad)));
  }

  sort(numParticles, xCoord, yCoord, ...others) {
    const {cols, cellStart, cursor} = this;
    if (this.order.length < numParticles) {
      this.cellOf = new Int32Array(numParticles);
      this.order = new Int32Array(numParticles);
    }
    const {cellOf, order} = this;

    cellStart.fill(0);
    for (let i = 0; i < numParticles; i++) {
      const cell = this.row(yCoord[i]) * cols + this.col(xCoord[i]);
      cellOf[i] = cell;
      cellStart[cell + 1]++;
    }
    for (let c = 1; c < cellStart.length; c++) cellStart[c] += cellStart[c - 1];

    // stable, so particles keep their order within a cell
    cursor.set(cellStart.subarray(0, cursor.length));
    for (let i = 0; i < numParticles; i++) order[cursor[cellOf[i]]++] = i;

    for (const array of [xCoord, yCoord, ...others]) {
      let scratch = this.scratch.get(array.constructor);
      if (!scratch || scratch.length < numParticles) {
        scratch = new array.constructor(numParticles);
        this.scratch.set(array.constructor, scratch);
      }
      for (let k = 0; k < numParticles; k++) scratch[k] = array[order[k]];
      array.set(scratch.subarray(0, numParticles));
    }
  }

  // how many particles were in the 3x3 block of cells around x, y at the
  // last sort
  countNear(x, y) {
    const {cols, rows, cellStart} = this;
    const col = this.col(x);
    const row = this.row(y);
    const c0 = Math.max(0, col - 1);
    const c1 = Math.min(cols - 1, col + 1);
    let count = 0;
    for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
      count += cellStart[r * cols + c1 + 1] - cellStart[r * cols + c0];
    }
    return count;
  }

  blocksAt(x, y) {
    return this.blocks[this.row(y) * this.cols + this.col(x)];
  }

  addBlocks(blocks) {
    const {cols, rows, rad} = this;
    for (const wall of blocks) {
      // clamp instead of skip, so a wall that hangs off the edge of the grid
      // still collides in the cells it does cover
      const y1 = Math.min(rows, Math.ceil(wall.y + wall.h));
      const x1 = Math.min(cols, Math.ceil(wall.x + wall.w));
      for (let y = Math.max(0, Math.floor(wall.y)); y < y1; y++) {
        for (let x = Math.max(0, Math.floor(wall.x)); x < x1; x++) {
          this.blocks[y * cols + x].push({
            x: wall.x * rad,
            y: wall.y * rad,
            w: wall.w * rad,
            h: wall.h * rad,
          });
        }
      }
    }
  }
}
