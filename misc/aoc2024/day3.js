const input = `xmul(2,4)&mul[3,7]!^don't()_mul(5,5)+mul(32,64](mul(11,8)undo()?mul(8,5))`;

const day1 = input
  .match(/mul\(\d+,\d+\)/g)
  .map((s) => {
    const [a, b] = s.match(/\d+/g);
    return a * b;
  })
  .reduce((a, b) => a + b, 0);

console.log('day1', day1);

let enabled = true;
let sum = 0;
input.match(/mul\(\d+,\d+\)|do\(\)|don't\(\)/g).forEach((s) => {
  if (s === "don't()") enabled = false;
  if (s === 'do()') enabled = true;
  if (enabled && s.startsWith('mul')) {
    const [a, b] = s.match(/\d+/g);
    sum += a * b;
  }
});
console.log('day2', sum);
