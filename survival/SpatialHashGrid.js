/**
 * SpatialHashGrid
 * ---------------
 * - cellSize: Size of each cell in world units
 * - cells: A Map from "cellX,cellY" -> array of objects in that cell
 *
 * Each object is assumed to have an (x, y) position. The object itself
 * keeps track of which cell it belongs to via `_gridKey` so we can
 * remove/update it easily.
 */

export class SpatialHashGrid {
  constructor(cellSize = 50) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }
  _getCellCoords(x, y) {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }
  _cellKey(cellX, cellY) {
    return `${cellX},${cellY}`;
  }
  insert(obj) {
    const [cellX, cellY] = this._getCellCoords(obj.x, obj.y);
    const key = this._cellKey(cellX, cellY);

    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }

    this.cells.get(key).push(obj);
    obj._gridKey = key;
  }
  remove(obj) {
    const key = obj._gridKey;
    if (key) {
      const cellArray = this.cells.get(key);
      if (cellArray) {
        const idx = cellArray.indexOf(obj);
        if (idx !== -1) {
          cellArray.splice(idx, 1);
          if (!cellArray.length) this.cells.delete(key);
        }
      }
      delete obj._gridKey;
    }
  }
  update(obj, newX, newY) {
    const [oldCellX, oldCellY] = this._getCellCoords(obj.x, obj.y);
    const [newCellX, newCellY] = this._getCellCoords(newX, newY);
    if (oldCellX !== newCellX || oldCellY !== newCellY) {
      this.remove(obj);
      obj.x = newX;
      obj.y = newY;
      this.insert(obj);
    } else {
      obj.x = newX;
      obj.y = newY;
    }
  }
  *queryRange(minX, minY, maxX, maxY) {
    const [minCellX, minCellY] = this._getCellCoords(minX, minY);
    const [maxCellX, maxCellY] = this._getCellCoords(maxX, maxY);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cellArray = this.cells.get(this._cellKey(cx, cy));
        if (!cellArray) continue;
        for (let obj of cellArray) yield obj;
      }
    }
  }
  *getAll() {
    for (const cell of this.cells.values()) {
      for (const obj of cell) yield obj;
    }
  }
}
