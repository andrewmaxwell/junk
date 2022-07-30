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
    const {grid, rows, cols, rad} = this;
    const row = Math.max(0, Math.min(rows - 1, Math.floor(y / rad)));
    const col = Math.max(0, Math.min(cols - 1, Math.floor(x / rad)));
    const cell = grid[row * cols + col];
    for (const v of cell.vicinity) v.items.push(i);
    return cell.items;
  }
  clear() {
    for (const g of this.grid) g.items.length = 0;
  }
}
