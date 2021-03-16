'use strict';
console.clear();

// construct an array of the 27 groups that must contain unique numbers
const groups = [];
for (let i = 0; i < 9; i++) {
  const r = [];
  const c = [];
  const g = [];
  for (let j = 0; j < 9; j++) {
    r[j] = i * 9 + j; // row
    c[j] = i + j * 9; // column
    g[j] =
      (Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + (i % 3) * 3 + (j % 3); // box
  }
  groups.push(r, c, g);
}

// return if a configuration is valid. 0s are wildcards and so are counted as valid anywhere.
const isValid = (b) => {
  for (let i = 0; i < groups.length; i++) {
    const seen = [];
    for (let j = 0; j < 9; j++) {
      const n = b[groups[i][j]];
      if (n && seen[n]) return false; // if any number besides 0 has been seen before, then its invalid
      seen[n] = true;
    }
  }
  return true;
};

const solve = (start) => {
  const queue = [start];
  while (queue.length) {
    const current = queue.pop();
    const index = current.indexOf(0);
    if (index === -1) return current;
    for (let i = 9; i > 0; i--) {
      const next = current.slice();
      next[index] = i;
      if (isValid(next)) queue.push(next);
    }
  }
};

// Recursive but much slower version:
// const solve = current => {
//   if (!isValid(current)) return;
//   const index = current.indexOf(0);
//   if (index === -1) return current; // if there are no more zeros, we're done here
//   for (let i = 9; i > 0; i--) { // try 1-9 in that zero
//     const next = current.slice();
//     next[index] = i;
//     const solution = solve(next);
//     if (solution) return solution;
//   }
// };

const input = document.querySelector('textarea');
const onInput = () => {
  const nums = input.value.match(/\d/g).map(Number);
  if (nums.length !== 81) return;

  const start = performance.now();
  const solution = solve(nums);
  const timing = performance.now() - start;

  document.querySelector('code').innerHTML = solution
    ? new Array(9)
        .fill()
        .map((v, i) => solution.slice(i * 9, i * 9 + 9).join(''))
        .join('\n')
    : 'No solution.';

  document.querySelector('#time').innerHTML = `Solved in ${timing.toFixed(
    2
  )} ms`;
};
input.addEventListener('keyup', onInput);

onInput(); // trigger it at the start
