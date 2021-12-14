const big = (str) => String(str).split('').map(Number).reverse();
const toStr = (x) => [...x].reverse().join('');
const normalize = (x) => {
  let carry = 0;
  for (let i = 0; i < x.length || carry; i++) {
    const v = (x[i] || 0) + carry;
    carry = Math.floor(v / 10);
    x[i] = v % 10;
  }
  return x;
};
const inc = (a) => {
  a[0]++;
  return normalize(a);
};
const modulo = (s, n) => s.reduceRight((r, t) => (r * 10 + t) % n, 0);
const lte = (a, b) => {
  if (b.length !== a.length) return a.length <= b.length;
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] !== b[i]) return a[i] <= b[i];
  }
};

const fizzbuzz = (nums, start, end) => {
  end = big(end);
  for (let i = big(start); lte(i, end); inc(i)) {
    let r = '';
    for (const k in nums) {
      if (modulo(i, k) === 0) r += nums[k];
    }
    console.log(r || toStr(i));
  }
};

/////////////////////

const obj = {3: 'Fizz', 5: 'Buzz', 7: 'Bizz', 11: 'Fuzz'};

// level 1
fizzbuzz({3: 'Fizz', 5: 'Buzz'}, 1, 100);

// level 2 & 3
fizzbuzz(obj, 1, 100);

// level 4
fizzbuzz(obj, 4234, 4300);

// level 5
fizzbuzz(
  obj,
  '12345678987654321234567898765432123457898765321',
  '12345678987654321234567898765432123457898765421'
);

// level 6
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

fizzbuzz(obj, uncurl('789\n612\n543'), uncurl('889\n612\n543'));

// level 7
const untree = (node) =>
  node ? untree(node.left) + uncurl(node.value) + untree(node.right) : '';

fizzbuzz(
  obj,
  untree({
    left: {
      left: {value: '1'},
      value: '2',
      right: {value: '3'},
    },
    value: '4',
    right: {
      left: {value: '10'},
      value: '5',
      right: {
        left: {value: '67'},
        value: '8',
        right: {value: '90\n 0'},
      },
    },
  }),
  untree({
    left: {value: '12\n 3'},
    value: '4',
    right: {
      left: {value: '10'},
      value: ' 56\n987',
      right: {value: '11'},
    },
  })
);

// level 8
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

fizzbuzz(obj, parseTree(tree1), parseTree(tree2));

// level 9
const mod = (a, b) => {
  let div = 0;
  while (a >= b) {
    div++;
    a -= b;
  }
  return {rem: a, div};
};

const numDivisors = (x) => {
  let count = 0;
  for (let i = 2; i < x; ) {
    const {rem, div} = mod(x, i);
    if (rem === 0) {
      count++;
      x = div;
    } else i++;
  }
  return count;
};

const merge = (a, b) =>
  !a.length
    ? b
    : !b.length
    ? a
    : a[0] < b[0]
    ? [a[0], ...merge(a.slice(1), b)]
    : [b[0], ...merge(a, b.slice(1))];

const mergeSort = (a) =>
  a.length < 2
    ? a
    : merge(
        mergeSort(a.slice(0, a.length / 2)),
        mergeSort(a.slice(a.length / 2))
      );

const whatTheBuzz = (arrs) =>
  mergeSort(
    arrs.map((arr) => {
      const min = arr.reduce((a, b) => Math.min(a, numDivisors(b)), Infinity);
      return arr.reduce((a, b) => a + (numDivisors(b) === min ? b : 0), 0);
    })
  ).map(
    (val) =>
      (mod(val, 3).rem ? '' : 'Fizz') + (mod(val, 5).rem ? '' : 'Buzz') || val
  );

console.log(
  'whatTheBuzz',
  whatTheBuzz([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9, 10, 11],
  ])
); // [Buzz, Fizz, Fizz]
