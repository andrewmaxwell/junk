import {benchmark} from '../benchmarks/benchmark.js';

const regex = (input) => {
  const [, min, max, letter, pw] = input.match(/(\d+)-(\d+) ([a-z]): (.+)/);
  const num = pw.match(new RegExp(letter, 'g'))?.length;
  return num >= +min && num <= +max;
};

const split = (input) => {
  const [rule, pw] = input.split(': ');
  const [counts, letter] = rule.split(' ');
  const [min, max] = counts.split('-');

  let count = 0;
  for (const t of pw) count += t === letter;
  return count >= min && count <= max;
};

console.log(split('2-4 a: abcdaaa'), true);
console.log(split('2-4 a: abcdaa'), false);
console.log(split('2-4 a: bcdef'), false);

benchmark({regex, split}, [
  ['2-4 a: abcdaaa'],
  ['2-4 a: abcdaa'],
  ['2-4 a: bcdef'],
]);
