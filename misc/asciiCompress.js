function compress(c) {
  let d = '',
    e = 0,
    m = 0,
    f = 0,
    h = 0,
    p,
    k = c.length,
    l;
  function a(b) {
    for (; 0 < b--; )
      (l = c.charCodeAt(e++) & 127),
        (32 > l && 9 != l && 10 != l) || 127 == l
          ? ((d += '`'), (l = (l + 34) & 127))
          : 96 == l && (d += '`'),
        (d += String.fromCharCode(l));
  }
  function b() {
    h &&
      ((e += h),
      (m -= h),
      (d += '`'),
      (f -= 5),
      (h -= 5),
      (h += 66),
      96 <= h && (h += 1),
      (d += String.fromCharCode(h)),
      (l = f % 94),
      (f = (f - l) / 94),
      (d += String.fromCharCode(l + 33)),
      (d += String.fromCharCode(f + 33)),
      (h = 0));
  }
  for (; e < k; ) {
    5 > m && (m = 5);
    e + m > k && (b(), a(k - e));
    p = c.substr(e, m);
    const n = 8840 < e ? e - 8840 : 0;
    p = c.substring(n, e).lastIndexOf(p);
    0 <= p ? ((f = e - (n + p)), (h = m++), 64 <= h && b()) : h ? b() : a(1);
  }
  return d;
}

function decompress(c) {
  function a() {
    b = c.charCodeAt(m++);
  }
  for (var b, d, e, m = 0, f = ''; m < c.length; )
    a(),
      96 == b
        ? (a(),
          96 == b
            ? (f += String.fromCharCode(b))
            : 65 < b
            ? ((e = b -= 96 < b ? 62 : 61),
              a(),
              (d = b - 28),
              a(),
              (d += 94 * (b - 33)),
              (f += f.substr(f.length - d, e)))
            : 32 < b && (f += String.fromCharCode((b - 34) & 127)))
        : (f += String.fromCharCode(b));
  return f;
}

import fs from 'fs';
const orig = fs.readFileSync('misc/sqlEngine.js', 'utf-8');

const compressed = compress(orig);
const decompressed = decompress(compressed);

console.log('Compressed:');
console.log(compressed);

// if (orig === decompressed) {
console.log();
const percent = Math.round((compressed.length / orig.length) * 1000) / 10;
console.log(`Compressed is ${percent}% this size of original.`);
// } else {
// console.log('\noriginal is not the same as decompressed!');
// console.log(decompressed);
// }
