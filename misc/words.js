import fs from 'fs';

const words = fs
  .readFileSync('./jibberjabber/bible.txt', 'utf-8')
  .toLowerCase()
  .replace(/[^ a-z]/g, '')
  .split(/\s+/);

const counts = {};
for (const w of words) {
  counts[w] = (counts[w] || 0) + 1;
}

console.log(Object.values(counts).filter((x) => x === 1).length);

// console.log(
//   Object.entries(counts)
//     .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
//     .map((p) => p.join(': '))
//     .join('\n')
// );
