import {randomIndex, shuffle} from './utils.js';

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1]
];
// const DIRECTIONS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export class Grid {
  constructor({width, height, initCell}) {
    this.width = width;
    this.height = height;

    var grid = (this._grid = []);

    var x, y;
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        grid[y * width + x] = {
          x,
          y,
          id: y * width + x,
          neighbors: []
        };
        initCell(grid[y * width + x]);
      }
    }
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        var cell = grid[y * width + x];
        if (!cell.occupant) {
          for (var i = 0; i < DIRECTIONS.length; i++) {
            var nx = x + DIRECTIONS[i][0];
            var ny = y + DIRECTIONS[i][1];
            if (
              nx >= 0 &&
              ny >= 0 &&
              nx < width &&
              ny < height &&
              !grid[ny * width + nx].occupant
            ) {
              cell.neighbors.push(grid[ny * width + nx]);
            }
          }
        }
      }
    }
  }
  getCells() {
    return this._grid;
  }
  getCell(ob) {
    return this._grid[ob.y * this.width + ob.x];
  }
  getOccupant(ob) {
    return this.getCell(ob).occupant;
  }
  setOccupant(ob) {
    this.getCell(ob).occupant = ob;
  }
  removeOccupant(ob) {
    this.getCell(ob).occupant = null;
  }
  getBestNeighbor(currentCell, cellUtility) {
    var utilVals = currentCell.neighbors.map(cellUtility);
    var maxUtilVal = Math.max(...utilVals);
    return randomIndex(
      currentCell.neighbors.filter(
        (n, i) => utilVals[i] > 0 && utilVals[i] == maxUtilVal
      )
    );
  }
  getPath(start, goalCondition, maxDist) {
    if (goalCondition(start, 0)) return [];

    var queue = [start];
    var seen = {};

    start.dist = 0;
    seen[start.id] = true;

    for (var i = 0; i < queue.length; i++) {
      var current = queue[i];
      if (current.dist + 1 > maxDist) continue;

      shuffle(current.neighbors);
      for (var j = 0; j < current.neighbors.length; j++) {
        var cell = current.neighbors[j];
        if (!seen[cell.id]) {
          if (goalCondition(cell, current.dist + 1)) {
            var path = [cell];
            while (current != start) {
              path.push(current);
              current = current.prev;
            }
            return path;
          }

          if (!cell.occupant) {
            queue.push(cell);
            seen[cell.id] = true;
            cell.prev = current;
            cell.dist = current.dist + 1;
          }
        }
      }
    }
    return [];
  }
  randomEmptySpace() {
    var x, y;
    do {
      x = Math.floor(Math.random() * this.width);
      y = Math.floor(Math.random() * this.height);
    } while (this._grid[y * this.width + x].occupant);
    return {x, y};
  }
}
