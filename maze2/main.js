const rows = 50;
const cols = 200;

const grid = [];

for (let y = 0; y < rows; y++) {
  grid[y] = [];
  for (let x = 0; x < cols; x++) {
    grid[y][x] = {x, y, open: false};
  }
}

const queue = [grid[0][1]]; // start from row 0, col 1

while (queue.length) {
  // remove a random one from the queue
  const curr = queue.splice(Math.floor(Math.random() * queue.length), 1)[0];

  // gets its neighbor cells (up, down, left, right)
  const neighbors = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(
    ([x, y]) => grid[curr.y + y] && grid[curr.y + y][curr.x + x]
  );

  // if curr isn't open and it's touching only one edge or open neighbor
  if (!curr.open && neighbors.filter(c => !c || c.open).length === 1) {
    // then open it and add its neighbor cells to the queue
    curr.open = true;
    neighbors.forEach(c => c && queue.push(c));
  }
}

// add an exit on the last row under the last open spot on the line above
grid[rows - 1][grid[rows - 2].map(c => c.open).lastIndexOf(true)].open = true;

// put it on the screen
document.body.innerHTML =
  '<pre>' + grid.map(r => r.map(c => (c.open ? ' ' : '#')).join('')).join('\n');
