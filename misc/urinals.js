const getIndexOfBestUrinal = (urinals) => {
  const seen = [];
  const queue = [];

  for (let i = 0; i < urinals.length; i++) {
    if (urinals[i]) {
      seen[i] = true;
      queue.push(i);
    }
  }

  if (queue.length === urinals.length) return -1;
  if (!queue.length) return 0;

  for (const index of queue) {
    if (index > 0 && !seen[index - 1]) {
      seen[index - 1] = 1;
      queue.push(index - 1);
    }

    if (index < urinals.length - 1 && !seen[index + 1]) {
      seen[index + 1] = 1;
      queue.push(index + 1);
    }
  }

  return queue.pop();
};

/////////////////////////////////

const tests = [
  {input: [0, 0, 0, 0, 1], expected: 0},
  {input: [1, 0, 0, 0, 0], expected: 4},
  {input: [1, 0, 0, 0, 1], expected: 2},
  {input: [1, 1, 1, 0, 1], expected: 3},
  {input: [1, 1, 1, 1, 1], expected: -1},
  {input: [0, 0, 0, 0, 0], expected: 0},
];

for (const {input, expected} of tests) {
  console.log(input);
  const actual = getIndexOfBestUrinal(input);
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
  console.log('PASS');
}
