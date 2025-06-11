/** @template {{id: number, minX: number, maxX: number, minY: number, maxY: number}} T */
export class SpatialHashGrid {
  /** @type {Record<string, T[]>} */
  #grid = {};

  /** @type {number} */
  #cellSize;

  /** @param {number} cellSize */
  constructor(cellSize) {
    this.#cellSize = cellSize;
  }

  clear() {
    this.#grid = {};
  }

  /** @param {T} shape */
  insert(shape) {
    const cellSize = this.#cellSize;

    const startX = Math.floor(shape.minX / cellSize);
    const endX = Math.floor(shape.maxX / cellSize);
    const startY = Math.floor(shape.minY / cellSize);
    const endY = Math.floor(shape.maxY / cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        (this.#grid[`${x},${y}`] ??= []).push(shape);
      }
    }
  }

  getOverlappingPairs() {
    const pairs = [];
    const checkedPairs = new Set();

    for (const key in this.#grid) {
      const cell = this.#grid[key];
      if (cell.length < 2) continue;
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i];
          const b = cell[j];
          const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);
          if (
            a.maxX > b.minX &&
            a.minX < b.maxX &&
            a.maxY > b.minY &&
            a.minY < b.maxY
          ) {
            pairs.push([a, b]);
          }
        }
      }
    }
    return pairs;
  }
}
