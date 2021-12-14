const MAX_NUM_DIGITS = 32;

const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

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

const coordsToGrid = (coords) => {
  const {minX, maxX, minY, maxY} = getBoundingBox(coords);
  const grid = [];
  for (let i = 0; i < maxY - minY + 1; i++) {
    grid[i] = new Array(maxX - minX + 1).fill(' ');
  }
  for (const c of coords) {
    grid[c.y - minY][c.x - minX] = c.val;
  }
  return grid;
};

const curl = (str) => {
  const result = [];
  for (let i = 0, x = 0, y = 0, counter = 0; i < str.length; counter++) {
    for (
      let z = 0;
      z < Math.floor(counter / 2) + 1 && i < str.length;
      z++, i++
    ) {
      result[i] = {x, y, val: str[i]};
      const d = dirs[counter % 4];
      x += d.x;
      y += d.y;
    }
  }
  return coordsToGrid(result);
};

const randomNumberString = () =>
  Array(1 + Math.floor(Math.random() * MAX_NUM_DIGITS))
    .fill()
    .map(() => Math.floor(Math.random() * 10))
    .join('')
    .replace(/^0+/, '') || '1';

const addToTreeRandomly = (tree, node) => {
  if (!tree) return node;
  if (Math.random() < 0.5) {
    tree.left = addToTreeRandomly(tree.left, node);
  } else {
    tree.right = addToTreeRandomly(tree.right, node);
  }
  return tree;
};

const generateTree = () => {
  let tree;
  for (let i = 0; i < 30; i++) {
    tree = addToTreeRandomly(tree, {
      value: curl(randomNumberString()),
    });
  }
  return tree;
};

const setWidth = (tree) => {
  if (tree.left) setWidth(tree.left);
  if (tree.right) setWidth(tree.right);
  const v = Math.ceil(tree.value[0].length / 2);
  tree.leftWidth = 1 + Math.max(v, tree.left?.width || 0);
  tree.width = tree.leftWidth + Math.max(v, tree.right?.width || 0);
  return tree;
};

const treeToCoords = (tree, x = 0, y = 0) => {
  const res = [];
  const tx = x + tree.leftWidth - Math.floor(tree.value[0].length / 2);
  for (let i = 0; i < tree.value.length; i++) {
    for (let j = 0; j < tree.value[0].length; j++) {
      res.push({x: tx + j, y: y + i, val: tree.value[i][j]});
    }
  }

  const cy = y + tree.value.length + 1;
  if (tree.left) {
    res.push(...treeToCoords(tree.left, x, cy), {
      x:
        x + tree.left.leftWidth + Math.floor(tree.left.value[0].length / 2) + 1,
      y: cy - 1,
      val: '/',
    });
  }

  if (tree.right) {
    res.push(...treeToCoords(tree.right, x + tree.leftWidth, cy), {
      x:
        x +
        tree.leftWidth +
        tree.right.leftWidth -
        Math.floor(tree.right.value[0].length / 2) -
        1,
      y: cy - 1,
      val: '\\',
    });
  }

  return res;
};

const tree = setWidth(generateTree());
const coords = treeToCoords(tree);
const ascii = coordsToGrid(coords)
  .map((r) => r.join(''))
  .join('\n');

// console.dir(tree);
console.log(ascii);
