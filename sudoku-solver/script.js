'use strict';
console.clear();

// construct an array of the 27 groups that must contain unique numbers
var groups = [];
for (var i = 0; i < 9; i++) {
  var r = [],
    c = [],
    g = [];
  for (var j = 0; j < 9; j++) {
    r[j] = i * 9 + j;
    c[j] = i + j * 9;
    g[j] =
      (Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + (i % 3) * 3 + (j % 3);
  }
  groups.push(r, c, g);
}

// return if a configuration is valid. 0s are wildcards and so are counted as valid anywhere.
var isValid = b => {
  for (var i = 0; i < groups.length; i++) {
    var seen = [];
    for (var j = 0; j < 9; j++) {
      var n = b[groups[i][j]];
      if (n && seen[n]) return false; // is any number besides 0 duplicated?
      seen[n] = true;
    }
  }
  return true;
};

var solve = start => {
  var queue = [start];
  while (queue.length) {
    var current = queue.pop(); // depth first
    var index = current.indexOf(0);
    if (index === -1) return current; // if there are no more zeros, we're done here
    for (var i = 9; i > 0; i--) {
      // try 1-9 in that zero
      var next = current.slice();
      next[index] = i;
      if (isValid(next)) queue.push(next); // queue up the valid ones
    }
  }
};

// Recursive but much slower version:
// var solve = current => {
//   if (!isValid(current)) return;
//   var index = current.indexOf(0);
//   if (index === -1) return current; // if there are no more zeros, we're done here
//   for (var i = 9; i > 0; i--) { // try 1-9 in that zero
//     var next = current.slice();
//     next[index] = i;
//     var solution = solve(next);
//     if (solution) return solution;
//   }
// };

// UI setup
var input = document.querySelector('textarea');
const onInput = () => {
  var nums = input.value.match(/\d/g).map(Number);
  if (nums.length !== 81) return;
  var solution = solve(nums);
  document.querySelector('code').innerHTML = solution
    ? new Array(9)
        .fill()
        .map((v, i) => solution.slice(i * 9, i * 9 + 9).join(''))
        .join('\n')
    : 'No solution.';
};
input.addEventListener('keyup', onInput);
onInput();
