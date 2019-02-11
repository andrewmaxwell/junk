export default class {
  constructor(rad, width, height) {
    this.rows = Math.ceil(height / rad);
    this.cols = Math.ceil(width / rad);
    this.rad = rad;
    this.grid = [];

    const {rows, cols, grid} = this;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        grid[i * cols + j] = {items: [], vicinity: []};
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        for (let m = Math.max(0, i - 1); m <= Math.min(rows - 1, i + 1); m++) {
          for (
            let n = Math.max(0, j - 1);
            n <= Math.min(cols - 1, j + 1);
            n++
          ) {
            grid[i * cols + j].vicinity.push(grid[m * cols + n]);
          }
        }
      }
    }
  }
  add(x, y, i) {
    const {grid, cols, rad} = this;
    var cell = grid[Math.floor(y / rad) * cols + Math.floor(x / rad)];
    if (!cell) throw new Error(`Bad coords: ${x}, ${y}`);
    for (var j = 0; j < cell.vicinity.length; j++) {
      cell.vicinity[j].items.push(i);
    }
    return cell.items;
  }
  clear() {
    const {grid} = this;
    for (var i = 0; i < grid.length; i++) {
      grid[i].items.length = 0;
    }
  }
}
