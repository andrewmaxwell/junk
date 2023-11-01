const complex = (r, i) => ({r, i});
const plus = (a, b) => complex(a.r + b.r, a.i + b.i);
const minus = (a, b) => complex(a.r - b.r, a.i - b.i);
const times = (a, b) => complex(a.r * b.r - a.i * b.i, a.r * b.i + a.i * b.r);

// length must be a power of 2
const fft = (arr, start = 0, step = 1) => {
  const len = arr.length / step;
  if (len === 1) return [arr[start]];

  const even = fft(arr, start, step * 2);
  const odd = fft(arr, start + step, step * 2);

  const halfLen = len / 2;
  const angle = Math.PI / halfLen;
  const twiddleFactor = complex(Math.cos(angle), Math.sin(angle));

  const result = new Array(len);
  let w = complex(1, 0); // w does a full rotation in the loop
  for (let i = 0; i < halfLen; i++) {
    const x = times(w, odd[i]);
    result[i] = plus(even[i], x);
    result[i + halfLen] = minus(even[i], x);
    w = times(w, twiddleFactor);
  }
  return result;
};

////////////////

const magnitude = (a) => Math.hypot(a.r, a.i);
const size = 32;
const arr = Array.from({length: size}, (_, i) => complex(Math.sin(i), 0));

console.log(
  fft(arr)
    .slice(0, size / 2)
    .map(magnitude)
    .map((x, i) => i.toString().padStart(2) + ' ' + '*'.repeat(x))
    .join('\n')
);
