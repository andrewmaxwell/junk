const input = `
MMMSXXMASM
MSAMXMSMSA
AMXSXMAAMM
MSAMASMSMX
XMASAMXAMM
XXAMMXXAMA
SMSMSASXSS
SAXAMASAAA
MAMMMXMMMM
MXMXAXMASX`.trim();

const rows = input.split('\n');
const lines = {};
for (let y = 0; y < rows.length; y++) {
  for (let x = 0; x < rows[y].length; x++) {
    for (const k of [`v${x}`, `h${y}`, `r${x - y}`, `l${x + y}`]) {
      (lines[k] ||= []).push(rows[y][x]);
    }
  }
}
const part1 = Object.values(lines).reduce(
  (sum, arr) =>
    sum +
    (arr.join('').match(/XMAS/g) || []).length +
    (arr.join('').match(/SAMX/g) || []).length,
  0
);
console.log('part1', part1);

const checkMS = (a, b) => (a === 'M' && b === 'S') || (a === 'S' && b === 'M');
let part2 = 0;
for (let y = 1; y < rows.length - 1; y++) {
  for (let x = 1; x < rows[y].length - 1; x++) {
    part2 +=
      rows[y][x] === 'A' &&
      checkMS(rows[y - 1][x - 1], rows[y + 1][x + 1]) &&
      checkMS(rows[y - 1][x + 1], rows[y + 1][x - 1]);
  }
}
console.log('part2', part2);
