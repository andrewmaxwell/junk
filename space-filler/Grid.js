export class Grid {
  constructor(size, width, height) {
    var rows = (this.rows = Math.ceil(height / size));
    var cols = (this.cols = Math.ceil(width / size));
    this.size = size;

    var grid = (this.grid = []);
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
    const {grid, cols, size} = this;
    var x = Math.floor(item.x / size);
    var y = Math.floor(item.y / size);
    grid[y * cols + x].vicinity.forEach(v => v.items.push(item));
  }
  clear() {
    this.grid.forEach(c => {
      c.items.length = 0;
    });
  }
  getNeighbors(x, y) {
    const {grid, cols, size} = this;
    return grid[Math.floor(y / size) * cols + Math.floor(x / size)].items;
  }
}
