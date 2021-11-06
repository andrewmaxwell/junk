const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

const fill = (grid, r, c) => {
  if (!grid[r] || grid[r][c] !== '@') return;
  grid[r][c] = ' ';
  for (const {x, y} of dirs) {
    fill(grid, r + y, c + x);
  }
};

const getGroups = (str) => {
  const grid = str.split('\n').map((r) => r.split(''));
  let count = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] !== '@') continue;
      count++;
      fill(grid, r, c); // mutates grid
    }
  }
  return count;
};

// class Grid {
//   constructor(str) {
//     this.grid = str.split('\n').map((r) => r.split(''));
//   }
//   fill(r, c) {
//     if (!this.grid[r] || this.grid[r][c] !== '@') return;
//     this.grid[r][c] = ' ';
//     for (const {x, y} of dirs) {
//       this.fill(r + y, c + x);
//     }
//   }
//   getGroups() {
//     let count = 0;
//     for (let r = 0; r < this.grid.length; r++) {
//       for (let c = 0; c < this.grid[0].length; c++) {
//         if (this.grid[r][c] !== '@') continue;
//         count++;
//         this.fill(r, c);
//       }
//     }
//     return count;
//   }
// }

// const getGroups = (str) => new Grid(str).getGroups();

const testStr = `
@ @@ @@@ @ @
 @ @@ @ @@@ 
@ @@ @@@@@ @
@@@ @ @@@ @ `.slice(1);

console.log(getGroups(testStr));
