const parent = (i) => ((i + 1) >>> 1) - 1;
const left = (i) => (i << 1) + 1;
const right = (i) => (i + 1) << 1;

const swap = (arr, i, j) => {
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
};

const makePriorityQueue = (compare) => {
  const heap = [];
  return {
    size: () => heap.length,
    push: (value) => {
      heap.push(value);
      let i = heap.length - 1;
      while (i > 0 && compare(heap[i], heap[parent(i)])) {
        swap(heap, i, parent(i));
        i = parent(i);
      }
    },
    pop: () => {
      const poppedValue = heap[0];
      const bottom = heap.length - 1;
      if (bottom > 0) swap(heap, 0, bottom);
      heap.pop();
      let i = 0;
      while (
        (left(i) < heap.length && compare(heap[left(i)], heap[i])) ||
        (right(i) < heap.length && compare(heap[right(i)], heap[i]))
      ) {
        const maxChild =
          right(i) < heap.length && compare(heap[right(i)], heap[left(i)])
            ? right(i)
            : left(i);
        swap(heap, i, maxChild);
        i = maxChild;
      }
      return poppedValue;
    },
  };
};

const getEstRemaining = (arr, solutionCoords, size) => {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    // if (!arr[i]) continue;
    const c = solutionCoords[arr[i]];
    total +=
      Math.abs((i % size) - c[0]) + Math.abs(Math.floor(i / size) - c[1]);
  }
  return total;
};

const getSolutionCoords = (size) => {
  const result = [[size - 1, size - 1]];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      result[i * size + j + 1] = [j, i];
    }
  }
  return result;
};

const getMove = (index, index2, arr) => {
  const copy = arr.slice();
  copy[index] = copy[index2];
  copy[index2] = 0;
  return {move: copy[index], arr: copy};
};

const getNeighbors = (arr, size) => {
  const index = arr.indexOf(0);
  const result = [];

  const x = index % size;
  if (x > 0) result.push(getMove(index, index - 1, arr));
  if (x < size - 1) result.push(getMove(index, index + 1, arr));

  const y = Math.floor(index / size);
  if (y > 0) result.push(getMove(index, index - size, arr));
  if (y < size - 1) result.push(getMove(index, index + size, arr));
  return result;
};

const getPath = (current) => [
  ...(current.prev.move ? getPath(current.prev) : []),
  current.move,
];

const slidePuzzle = (initialArr) => {
  const seen = {};
  const size = initialArr.length;
  const solutionCoords = getSolutionCoords(size);
  const q = makePriorityQueue(
    (a, b) => a.dist + a.estRemaining < b.dist + b.estRemaining
  );
  const initialFlat = [].concat(...initialArr);
  const start = {
    dist: 0,
    estRemaining: getEstRemaining(initialFlat, solutionCoords, size),
    arr: initialFlat,
  };
  q.push(start);
  seen[initialFlat.join(',')] = start;

  while (q.size()) {
    const current = q.pop();
    if (!current.estRemaining || q.size() > 2e6) return getPath(current);

    for (const n of getNeighbors(current.arr, size)) {
      const key = n.arr.join(',');
      const s = seen[key];
      if (!s) {
        seen[key] = {
          dist: current.dist + 1,
          estRemaining: getEstRemaining(n.arr, solutionCoords, size),
          arr: n.arr,
          prev: current,
          move: n.move,
        };
        q.push(seen[key]);
      } else if (current.dist + 1 < s.dist) {
        s.dist = current.dist + 1;
        s.prev = current;
        s.move = n.move;
      }
    }
  }
};

// const slidePuzzle = (arr) => {
//   const size = arr.length;
//   const solutionCoords = getSolutionCoords(size);

//   const seen = {};
//   const result = [];
//   let current = [].concat(...arr);
//   let score = getEstRemaining(current, solutionCoords, size);

//   seen[current.join(',')] = true;

//   while (score) {
//     let bestScore = Infinity;
//     let best;
//     for (const n of getNeighbors(current, size)) {
//       const key = n.arr.join('');
//       if (seen[key]) continue;
//       seen[key] = true;

//       const s = getEstRemaining(n.arr, solutionCoords, size);
//       if (s < bestScore) {
//         bestScore = s;
//         best = n;
//       }
//     }

//     current = best.arr;
//     score = bestScore;
//     result.push(best.move);
//   }
//   return result;
// };

// https://www.codewars.com/kata/5a20eeccee1aae3cbc000090/train/javascript

const p1 = [
  [1, 2, 3, 4],
  [5, 0, 6, 8],
  [9, 10, 7, 11],
  [13, 14, 15, 12],
];
let p2 = [
  [3, 7, 14, 15, 10],
  [1, 0, 5, 9, 4],
  [16, 2, 11, 12, 8],
  [17, 6, 13, 18, 20],
  [21, 22, 23, 19, 24],
];
const p3 = [
  [3, 9, 11, 7],
  [1, 12, 13, 4],
  [8, 2, 14, 0],
  [6, 10, 15, 5],
];
console.time();
console.log(slidePuzzle(p2)); // [6,7,11,12]
console.timeEnd();
// console.log(
//   getEstRemaining(simpleExample, getSolutionCoords(simpleExample.length))
// );
// console.log(getSolutionCoords(4));
