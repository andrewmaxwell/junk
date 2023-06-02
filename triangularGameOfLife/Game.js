const baseCoords = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [2, 0],
  [-2, 0],
];
const pointUpNeighbors = [...baseCoords, [2, 1], [-2, 1]];
const pointDownNeighbors = [...baseCoords, [2, -1], [-2, -1]];

export class Game {
  constructor(rows, cols) {
    this.grid = [];
    this.grid2 = [];
    this.rows = rows;
    this.cols = cols;

    for (let y = 0; y < rows; y++) {
      this.grid[y] = new Array(cols).fill(0);
      this.grid2[y] = new Array(cols).fill(0);
    }

    this.neighborCoords = [];
    for (let y = 0; y < rows; y++) {
      this.neighborCoords[y] = [];
      for (let x = 0; x < cols; x++) {
        this.neighborCoords[y][x] = (
          (x + y) % 2 ? pointUpNeighbors : pointDownNeighbors
        )
          .map(([dx, dy]) => ({x: x + dx, y: y + dy}))
          .filter(({x, y}) => typeof this.grid[y]?.[x] === 'number');
      }
    }
  }
  randomize() {
    const {rows, cols} = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.grid[y][x] = Math.random() < 0.5 ? 0 : 1;
      }
    }
  }
  safeGet(x, y) {
    return this.grid[y]?.[x] || 0;
  }
  get(x, y) {
    return this.grid[y][x];
  }
  set(x, y, v) {
    if (typeof this.grid[y]?.[x] !== 'undefined') {
      this.grid[y][x] = v;
    }
  }
  step(params) {
    const {rows, cols, grid, grid2, neighborCoords} = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let numNeighbors = 0;
        for (const c of neighborCoords[y][x]) {
          numNeighbors += grid[c.y][c.x];
        }
        grid2[y][x] = grid[y][x]
          ? numNeighbors >= params.minToStayAlive &&
            numNeighbors <= params.maxToStayAlive
          : numNeighbors >= params.minForSpawn &&
            numNeighbors <= params.maxForSpawn;
      }
    }
    [this.grid, this.grid2] = [this.grid2, this.grid];
  }
}
