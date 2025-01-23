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

  insert(obj) {
    const cellX = Math.floor(obj.x / this.cellSize);
    const cellY = Math.floor(obj.y / this.cellSize);
    const key = cellX + ',' + cellY;

    let cellArray = this.cells.get(key);
    if (!cellArray) {
      cellArray = [];
      this.cells.set(key, cellArray);
    }
    cellArray.push(obj);
    obj._gridKey = key;
  }

  remove(obj) {
    const key = obj._gridKey;
    if (key !== undefined) {
      const cellArray = this.cells.get(key);
      if (cellArray) {
        const idx = cellArray.indexOf(obj);
        if (idx !== -1) {
          cellArray.splice(idx, 1);
          if (cellArray.length === 0) {
            this.cells.delete(key);
          }
        }
      }
      obj._gridKey = undefined;
    }
  }

  update(obj, newX, newY) {
    const oldCellX = Math.floor(obj.x / this.cellSize);
    const oldCellY = Math.floor(obj.y / this.cellSize);
    const newCellX = Math.floor(newX / this.cellSize);
    const newCellY = Math.floor(newY / this.cellSize);

    if (oldCellX === newCellX && oldCellY === newCellY) {
      obj.x = newX;
      obj.y = newY;
      return;
    }
    this.remove(obj);
    obj.x = newX;
    obj.y = newY;
    this.insert(obj);
  }

  queryRange(minX, minY, maxX, maxY) {
    const minCellX = Math.floor(minX / this.cellSize);
    const minCellY = Math.floor(minY / this.cellSize);
    const maxCellX = Math.floor(maxX / this.cellSize);
    const maxCellY = Math.floor(maxY / this.cellSize);

    const results = [];
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = cx + ',' + cy;
        const cellArray = this.cells.get(key);
        if (!cellArray) continue;
        results.push(...cellArray);
      }
    }
    return results;
  }

  getAll() {
    const items = [];
    for (const arr of this.cells.values()) items.push(...arr);
    return items;
  }

  isOccupied(x, y, rad) {
    const nearby = this.queryRange(x - rad, y - rad, x + rad, y + rad);
    for (const element of nearby) {
      const item = element;
      const dx = item.x - x;
      const dy = item.y - y;
      if (dx * dx + dy * dy < rad * rad * 4) {
        return true;
      }
    }
    return false;
  }
}
