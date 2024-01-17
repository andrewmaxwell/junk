export default class {
  constructor(rad, width, height) {
    this.rows = Math.ceil(height / rad);
    this.cols = Math.ceil(width / rad);
    this.rad = rad;
    this.grid = [];

    const {rows, cols, grid} = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        grid[y * cols + x] = {x, y, items: [], vicinity: [], blocks: []};
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        for (let m = Math.max(0, y - 1); m <= Math.min(rows - 1, y + 1); m++) {
          for (
            let n = Math.max(0, x - 1);
            n <= Math.min(cols - 1, x + 1);
            n++
          ) {
            grid[y * cols + x].vicinity.push(grid[m * cols + n]);
          }
        }
      }
    }
  }
  getCell(x, y) {
    const {grid, rows, cols, rad} = this;
    const row = Math.max(0, Math.min(rows - 1, Math.floor(y / rad)));
    const col = Math.max(0, Math.min(cols - 1, Math.floor(x / rad)));
    return grid[row * cols + col];
  }
  add(x, y, i) {
    const cell = this.getCell(x, y);
    for (const v of cell.vicinity) v.items.push(i);
    return cell.items;
  }
  clear() {
    for (const g of this.grid) g.items.length = 0;
  }
  addBlocks(blocks) {
    const {grid, cols, rows, rad} = this;
    for (const wall of blocks) {
      for (let y = wall.y; y < wall.y + wall.h; y++) {
        for (let x = wall.x; x < wall.x + wall.w; x++) {
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          grid[y * cols + x].blocks.push({
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
