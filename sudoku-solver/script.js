'use strict';
console.clear();

// construct an array of the 27 groups that must contain unique numbers
const groups = [];
for (let i = 0; i < 9; i++) {
  const r = [],
    c = [],
    g = [];
  for (let j = 0; j < 9; j++) {
    r[j] = i * 9 + j;
    c[j] = i + j * 9;
    g[j] =
      (Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + (i % 3) * 3 + (j % 3);
  }
  groups.push(r, c, g);
}

// return if a configuration is valid. 0s are wildcards and so are counted as valid anywhere.
const isValid = b => {
  for (let i = 0; i < groups.length; i++) {
    const seen = [];
    for (let j = 0; j < 9; j++) {
      const n = b[groups[i][j]];
      if (n && seen[n]) return false; // is any number besides 0 duplicated?
      seen[n] = true;
    }
  }
  return true;
};

let solve = start => {
  const queue = [start];
  while (queue.length) {
    const current = queue.pop(); // depth first
    const index = current.indexOf(0);
    if (index === -1) return current; // if there are no more zeros, we're done here
    for (let i = 9; i > 0; i--) {
      // try 1-9 in that zero
      const next = current.slice();
      next[index] = i;
      if (isValid(next)) queue.push(next); // queue up the valid ones
    }
  }
};

// Recursive but much slower version:
// let solve = current => {
//   if (!isValid(current)) return;
//   let index = current.indexOf(0);
//   if (index === -1) return current; // if there are no more zeros, we're done here
//   for (let i = 9; i > 0; i--) { // try 1-9 in that zero
//     let next = current.slice();
//     next[index] = i;
//     let solution = solve(next);
//     if (solution) return solution;
//   }
// };

// UI setup
const input = document.querySelector('textarea');
const onInput = () => {
  const nums = input.value.match(/\d/g).map(Number);
  if (nums.length !== 81) return;
  const solution = solve(nums);
  document.querySelector('code').innerHTML = solution
    ? new Array(9)
        .fill()
        .map((v, i) => solution.slice(i * 9, i * 9 + 9).join(''))
        .join('\n')
    : 'No solution.';
};
input.addEventListener('keyup', onInput);
onInput();
