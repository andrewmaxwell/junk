// https://gist.github.com/jwMaxwell/42688a864028e98bae8541177692596b

const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

const uncurl = (str) => {
  const rows = str.split('\n');
  let x = Math.ceil(rows[0].length / 2 - 1);
  let y = Math.ceil(rows.length / 2 - 1);
  let result = rows[y][x];

  let counter = 0;
  let dir = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (let i = 0; i < Math.floor(counter / 2) + 1; i++) {
      x += dirs[dir].x;
      y += dirs[dir].y;
      if (!rows[y]?.[x]?.trim()) return result;
      result += rows[y][x];
    }

    dir = (dir + 1) % 4;
    counter++;
  }
};

const isNum = (x) => x?.match(/^\d$/);

const getNumCoords = (grid, x, y) => {
  const result = [{x, y, val: grid[y][x]}];
  for (const r of result) {
    for (const d of dirs) {
      const cx = r.x + d.x;
      const cy = r.y + d.y;
      if (isNum(grid[cy]?.[cx])) {
        result.push({x: cx, y: cy, val: grid[cy][cx]});
        grid[cy][cx] = ''; // MUTATING SIDE EFFECT. This will prevent numbers from being counted more than once. There are other ways I could have done that, but this was easiest.
      }
    }
  }
  return result;
};

const getBoundingBox = (coords) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of coords) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  return {minX, maxX, minY, maxY};
};

const coordsToNum = (coords) => {
  const {minX, maxX, minY, maxY} = getBoundingBox(coords);
  const grid = [];
  for (let i = 0; i < maxY - minY + 1; i++) {
    grid[i] = new Array(maxX - minX + 1).fill(' ');
  }
  for (const c of coords) {
    grid[c.y - minY][c.x - minX] = c.val;
  }
  return {
    value: grid.map((r) => r.join('')).join('\n'),
    x: (maxX + minX) / 2,
    top: minY,
    bottom: maxY + 1,
  };
};

const closestNode = (nodes, x, y, prop) => {
  let closestDist = Infinity;
  let result;
  for (const n of nodes) {
    const dx = Math.abs(n.x - x);
    if (n[prop] === y && dx < closestDist) {
      closestDist = dx;
      result = n;
    }
  }
  return result;
};

const untree = (node) =>
  node ? untree(node.left) + uncurl(node.value) + untree(node.right) : '';

const parseTree = (str) => {
  const grid = str.split('\n').map((r) => [...r]);
  const nodes = [];
  const edges = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (isNum(grid[y][x])) {
        const coords = getNumCoords(grid, x, y);
        nodes.push(coordsToNum(coords));
      } else if (grid[y][x] === '/') {
        edges.push({x0: x + 1, y0: y, x1: x, y1: y + 1, val: grid[y][x]});
      } else if (grid[y][x] === '\\') {
        edges.push({x0: x, y0: y, x1: x + 1, y1: y + 1, val: grid[y][x]});
      }
    }
  }

  for (const {x0, y0, x1, y1, val} of edges) {
    const a = closestNode(nodes, x0, y0, 'bottom');
    const b = closestNode(nodes, x1, y1, 'top');
    a[val === '/' ? 'left' : 'right'] = b;
  }
  return untree(nodes[0]);
};

const tree1 = `
       4     
     /   \\    
   12      56 
    3     987 
          / \\ 
        10   11`;

const tree2 = `
      5
     / \\
  012   7
  143  / \\
      6   89
          15 `;

console.dir(parseTree(tree2)); // '1234105678911'
