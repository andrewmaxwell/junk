const move = (str, index, dir) => {
  const arr = str.split('');
  arr[index] = (Number(arr[index]) + dir + 10) % 10;
  return arr.join('');
};

const getNext = (n) => {
  const result = [];
  for (let i = 0; i < 4; i++) {
    result.push(move(n, i, 1), move(n, i, -1));
  }
  return result;
};

const start = '0000';

const getSteps = (target, deadends) => {
  const badSet = new Set(deadends);
  if (badSet.has(start) || getNext(target).every((x) => badSet.has(x)))
    return -1;

  const q = [[start]];
  while (q.length) {
    const current = q.shift();
    const neighbors = getNext(current[current.length - 1]);
    for (const n of neighbors) {
      if (n === target) return console.log([...current, n]) || current.length;
      if (!badSet.has(n) && !current.includes(n)) q.push([...current, n]);
    }
  }
  return -1;
};

// TODO: Use A* Search

console.time();
const result = getSteps('0202', ['0201', '0101', '0102', '1212', '2002']);
// const result = getSteps('0009', ['8888']);
// const result = getSteps('8888', [
//   '8887',
//   '8889',
//   '8878',
//   '8898',
//   '8788',
//   '8988',
//   '7888',
//   '9888',
// ]);
// const result = getSteps('8888', ['0000']);
console.timeEnd();
console.log(result);

/*

0000
0100
0200
0209
0208
0207
0206
0205
0204
0203
0202


*/
