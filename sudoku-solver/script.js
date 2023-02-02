import {solveSudoku} from './solveSudoku.js';

const textarea = document.querySelector('textarea');
const onInput = () => {
  const input = textarea.value.match(/[.1-9]{9}/g).map((r) => [...r]);
  if (input.length !== 9 || input.some((r) => r.length !== 9)) return;

  const start = performance.now();
  const solution = solveSudoku(input);
  const timing = performance.now() - start;

  document.querySelector('code').innerHTML = solution
    ? solution.map((r) => r.join('')).join('\n')
    : 'No solution.';

  document.querySelector('#time').innerHTML = `Solved in ${timing.toFixed(
    2
  )} ms`;
};

textarea.addEventListener('input', onInput);

onInput(); // trigger it at the start
