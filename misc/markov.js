import fs from 'fs';

const buildIndex = (arr, contextSize) => {
  const index = {};
  for (let i = 0; i < arr.length - contextSize; i++) {
    const key = arr.slice(i, i + contextSize).join('\x1E');

    if (!index[key]) {
      index[key] = [];
    }

    index[key].push(arr[i + contextSize]);
  }
  return index;
};

const randomElement = (arr) =>
  arr.length === 1 ? arr[0] : arr[Math.floor(Math.random() * arr.length)];

const makeNonsense = (index, length) => {
  const firstKey = Object.keys(index)[0].split('\x1E');
  const contextSize = firstKey.length;
  let result = firstKey;

  while (result.length < length) {
    const key = result.slice(-contextSize).join('\x1E');
    result.push(randomElement(index[key]));
  }
  return result.join('');
};

const text = fs.readFileSync('misc/texts.txt', 'utf-8');
const index = buildIndex(text.split(/\b/), 3);
const nonsense = makeNonsense(index, 1000);

console.log(nonsense);
