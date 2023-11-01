const dirs = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

const boggleSolver = (grid, dict) => {
  const boardSize = Math.sqrt(grid.length);

  const trie = {};
  for (const word of dict) {
    let ct = trie;
    for (const letter of word) ct = ct[letter] = ct[letter] || {};
    ct._ = true;
  }

  const queue = grid.map((_, i) => [i]); // each possible starting position

  const result = new Set();
  for (const path of queue) {
    let ct = trie;
    for (const i of path) {
      for (const c of grid[i]) ct = ct[c];
    }

    if (ct._) result.add(path.map((p) => grid[p]).join(''));

    const lastIndex = path[path.length - 1];
    const cx = lastIndex % boardSize;
    const cy = Math.floor(lastIndex / boardSize);
    for (const [dy, dx] of dirs) {
      const index = (cy + dy) * boardSize + cx + dx;
      if (
        cx + dx >= 0 &&
        cy + dy >= 0 &&
        cx + dx < boardSize &&
        cy + dy < boardSize &&
        ct[grid[index][0]] && // must be part of a word in the dictionary
        (grid[index].length === 1 || ct[grid[index][0]][grid[index][1]]) && // handle two-letter combos
        !path.includes(index) // can't use the same index twice
      ) {
        queue.push([...path, index]);
      }
    }
  }

  return [...result].sort((a, b) => a.length - b.length || a.localeCompare(b));
};

import fetch from 'node-fetch';
const go = async () => {
  const response = await fetch(
    'https://raw.githubusercontent.com/redbo/scrabble/master/dictionary.txt'
  );
  const dict = await response.text();
  const grid = `
RTALI
UInRTE
EMLRV
EDOGU
HKIHD`;

  const solution = boggleSolver(
    grid
      .replace(/\W/g, '')
      .match(/[A-Z][a-z]*/g)
      .map((w) => w.toUpperCase()),
    dict.split('\n')
  ).filter((s) => s.length >= 4);

  console.log(solution.map((s) => `${s} (${s.length})`).join('\n'));
  console.log(solution.length, 'words');
};

go();
