const mergeAndCountSmaller = (items, low, mid, high, result) => {
  const sorted = [];
  let n = 0;
  let l = low;
  let h = mid + 1;

  while (l <= mid && h <= high) {
    if (items[l].val > items[h].val) {
      sorted.push(items[h]);
      n++;
      h++;
    } else {
      sorted.push(items[l]);
      result[items[l].index] += n;
      l++;
    }
  }

  while (l <= mid) {
    sorted.push(items[l]);
    result[items[l].index] += n;
    l++;
  }

  while (h <= high) {
    sorted.push(items[h]);
    h++;
  }

  for (let i = 0; i < sorted.length; i++) {
    items[low + i] = sorted[i];
  }

  return result;
};

const mergeSort = (items, low, high, result) => {
  const mid = Math.floor((high + low) / 2);
  if (low < mid) mergeSort(items, low, mid, result);
  if (mid + 1 < high) mergeSort(items, mid + 1, high, result);
  return mergeAndCountSmaller(items, low, mid, high, result);
};

const smaller = (arr) => [
  ...mergeSort(
    arr.map((val, index) => ({val, index})),
    0,
    arr.length - 1,
    new Int32Array(arr.length)
  ),
];

const input = [10, 9, 5, 2, 7, 6, 11, 0, 2];
// const input = [1, 3, 2, 1, 0];
// const input = [...new Array(1e5)].map(() => Math.floor(Math.random() * 10) - 5);
console.time();
const result = smaller(input);
console.timeEnd();
console.log(result.join(' ') === '7 6 3 1 3 2 2 0 0');
