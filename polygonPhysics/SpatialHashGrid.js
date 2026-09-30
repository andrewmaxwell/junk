/** @template {{id: number, awake: boolean, minX: number, maxX: number, minY: number, maxY: number}} T */
export class SpatialHashGrid {
  /** @type {Map<number, T[]>} */
  #grid = new Map();

  /** @type {number} */
  #cellSize;

  /** @param {number} cellSize */
  constructor(cellSize) {
    this.#cellSize = cellSize;
  }

  /** Cell coords packed into one number, much cheaper than string keys. Good for ±32k cells. */
  #key = (/** @type {number} */ x, /** @type {number} */ y) =>
    (x + 32768) * 65536 + (y + 32768);

  #cell = (/** @type {number} */ v) => Math.floor(v / this.#cellSize);

  clear() {
    // keep the arrays around so they don't have to be reallocated every step
    for (const cell of this.#grid.values()) cell.length = 0;
  }

  /** @param {T} shape */
  insert(shape) {
    const endX = this.#cell(shape.maxX);
    const endY = this.#cell(shape.maxY);
    for (let x = this.#cell(shape.minX); x <= endX; x++) {
      for (let y = this.#cell(shape.minY); y <= endY; y++) {
        const key = this.#key(x, y);
        const cell = this.#grid.get(key);
        if (cell) cell.push(shape);
        else this.#grid.set(key, [shape]);
      }
    }
  }

  /**
   * Calls fn for everything whose bounding box is within margin of shape's.
   * fn can be called more than once for the same thing.
   * @type {(shape: T, margin: number, fn: (other: T) => void) => void}
   */
  forEachNear(shape, margin, fn) {
    const minX = shape.minX - margin;
    const maxX = shape.maxX + margin;
    const minY = shape.minY - margin;
    const maxY = shape.maxY + margin;
    for (let x = this.#cell(minX); x <= this.#cell(maxX); x++) {
      for (let y = this.#cell(minY); y <= this.#cell(maxY); y++) {
        for (const other of this.#grid.get(this.#key(x, y)) ?? []) {
          if (
            other !== shape &&
            other.maxX > minX &&
            other.minX < maxX &&
            other.maxY > minY &&
            other.minY < maxY
          ) {
            fn(other);
          }
        }
      }
    }
  }

  /** Pairs with overlapping bounding boxes where at least one is awake, lower id first. */
  getOverlappingPairs() {
    /** @type {Array<[T, T]>} */
    const pairs = [];

    for (const [key, cell] of this.#grid) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i];
          const b = cell[j];
          if (!a.awake && !b.awake) continue;
          if (
            a.maxX <= b.minX ||
            a.minX >= b.maxX ||
            a.maxY <= b.minY ||
            a.minY >= b.maxY
          ) {
            continue;
          }
          // a pair can share several cells; only report it from the cell holding
          // the top-left corner of the overlap, so no dedupe set is needed
          const ownerKey = this.#key(
            this.#cell(Math.max(a.minX, b.minX)),
            this.#cell(Math.max(a.minY, b.minY)),
          );
          if (ownerKey !== key) continue;
          pairs.push(a.id < b.id ? [a, b] : [b, a]);
        }
      }
    }
    return pairs;
  }
}
