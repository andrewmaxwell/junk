function swap(arr, i, j, steps) {
  if (i === j) return;
  steps.push({type: 'swap', a: i, b: j, arr: [...arr]});
  const temp = arr[i];
  arr[i] = arr[j];
  arr[j] = temp;
}

function partition(arr, left, right, steps) {
  const pivot = arr[right];
  let i = left - 1;

  for (let j = left; j < right; j++) {
    if (arr[j] <= pivot) {
      i++;
      swap(arr, i, j, steps);
    }
  }
  swap(arr, i + 1, right, steps);
  return i + 1;
}

export function quickSort(arr, left = 0, right = arr.length - 1, steps = []) {
  if (left < right) {
    const pivotIndex = partition(arr, left, right, steps);
    quickSort(arr, left, pivotIndex - 1, steps);
    quickSort(arr, pivotIndex + 1, right, steps);
  }
  return steps;
}
