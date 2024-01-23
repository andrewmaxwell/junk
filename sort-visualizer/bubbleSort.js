export function bubbleSort(arr) {
  const steps = [];
  let n = arr.length;
  let swapped;

  do {
    swapped = false;
    for (let i = 0; i < n - 1; i++) {
      // steps.push({type: 'compare', a: i, b: i + 1, arr: [...arr]});
      steps.push({type: 'access', i, arr: [...arr]});
      steps.push({type: 'access', i: i + 1, arr: [...arr]});
      if (arr[i] > arr[i + 1]) {
        steps.push({type: 'swap', a: i, b: i + 1, arr: [...arr]});
        let temp = arr[i];
        arr[i] = arr[i + 1];
        arr[i + 1] = temp;
        swapped = true;
      }
    }
    n--;
  } while (swapped);

  return steps;
}
