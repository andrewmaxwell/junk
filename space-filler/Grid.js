export class Grid {
  constructor(size, width, height) {
    this.rows = Math.ceil(height / size);
    this.cols = Math.ceil(width / size);
    this.size = size;
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
  add(item) {
    var col = Math.floor(item.x / this.size);
    var row = Math.floor(item.y / this.size);
    var vic = this.grid[row * this.cols + col].vicinity;
    for (const v of vic) v.items.push(item);
    return this.grid[row * this.cols + col].items;
  }
  clear() {
    for (const cell of this.grid) cell.items.length = 0;
  }
  getNeighbors(x, y) {
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.size)));
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.size)));
    return this.grid[row * this.cols + col].items;
  }
}
