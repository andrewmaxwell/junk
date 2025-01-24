const input = '2333133121414131402'.split('').map(Number);

const arr1 = [];
for (let i = 0; i < input.length; i++) {
  for (let j = 0; j < input[i]; j++) {
    arr1.push(i % 2 ? '.' : Math.floor(i / 2));
  }
}

let left = 0;
let right = arr1.length - 1;

while (true) {
  while (left < arr1.length && arr1[left] !== '.') left++;
  while (arr1[right] === '.') right--;
  if (left >= right || !arr1[left] || !arr1[right]) break;
  [arr1[left], arr1[right]] = [arr1[right], arr1[left]];
}

console.log(
  'part1',
  arr1.reduce((res, v, i) => res + (v === '.' ? 0 : v * i), 0)
);

//////

const files = [];
let pos = 0;
for (let i = 0; i < input.length; i++) {
  if (i % 2 === 0) files.push({id: Math.floor(i / 2), size: input[i], pos});
  pos += input[i];
}

for (const f of files.toReversed()) {
  const fileBeforeGap = files.find(
    (k, i) => k.pos < f.pos && files[i + 1]?.pos - k.pos - k.size >= f.size
  );
  if (fileBeforeGap) {
    f.pos = fileBeforeGap.pos + fileBeforeGap.size;
    files.sort((a, b) => a.pos - b.pos);
  }
}

const arr2 = new Array(pos).fill('.');
for (const {id, size, pos} of files) {
  for (let i = 0; i < size; i++) arr2[pos + i] = id;
}

console.log(
  'part2',
  arr2.reduce((res, v, i) => res + (v === '.' ? 0 : v * i), 0)
);
