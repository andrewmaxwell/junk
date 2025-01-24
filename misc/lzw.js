const longestRepeatedSubstring = (str) => {
  let a = new Array(str.length + 1).fill(0);
  let b = new Array(str.length + 1).fill(0);

  const indexes = {};
  const counts = {};
  for (let i = 0; i < str.length; i++) {
    for (let j = i + 1; j < str.length; j++) {
      const k = (b[j + 1] = str[i] === str[j] && a[j] < j - i ? a[j] + 1 : 0);
      if (k <= 1) continue;
      const start = i + 1 - k;
      const s = str.slice(start, i + 1);
      if (!counts[s]) {
        counts[s] = 2;
        indexes[s] = start;
      } else if (start === indexes[s]) counts[s]++;
    }
    let t = a;
    a = b;
    b = t;
  }

  let result = '';
  let shortest = str.length;
  for (const key in counts) {
    const k = key.length;
    const len = k + counts[key] * (1 - k);
    if (len < shortest) {
      result = key;
      shortest = len;
    }
  }
  return result;
};

const compress = (str, counter = 256) => {
  const longest = longestRepeatedSubstring(str);
  console.log(str.length, JSON.stringify(longest));
  if (longest.length < 2) return str;
  const s = String.fromCharCode(counter);
  const next = compress(
    s + longest + s + str.replaceAll(longest, s),
    counter + 1
  );
  return next.length < str.length ? next : str;
};

const decompress = (str) => {
  if (str.charCodeAt(0) < 256) return str;
  const [, rep, ...rest] = str.split(str[0]);
  return decompress(rest.join(rep));
};

import fs from 'fs';
const orig = fs.readFileSync('misc/lzw.js', 'utf-8');

const compressed = compress(orig);
const decompressed = decompress(compressed);

console.log('Compressed:');
console.log(compressed);

if (orig === decompressed) {
  console.log();
  const percent = Math.round((compressed.length / orig.length) * 1000) / 10;
  console.log(`Compressed is ${percent}% this size of original.`);
} else {
  console.log('\noriginal is not the same as decompressed!');
  console.log(decompressed);
}
