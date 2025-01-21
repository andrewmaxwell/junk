export const nextMonth = (date) => {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + 1);
  newDate.setDate(1);
  return newDate;
};

export const calcFrequency = (
  data,
  freqPeriod,
  resultLength,
  func = () => 1
) => {
  const min = data[0];
  const range = data[data.length - 1] - min;
  const winRad = (freqPeriod / range) * resultLength * 0.5;
  const result = new Array(resultLength).fill(0);

  for (const val of data) {
    const x = ((val - min) / range) * resultLength;
    for (
      let i = Math.max(0, Math.floor(x - winRad));
      i <= Math.min(resultLength - 1, x + winRad);
      i++
    ) {
      result[i] += func((i - x) / winRad);
    }
  }
  return result;
};

// export const smooth = (arr, iterations = 1) => {
//   for (let i = 0; i < iterations; i++) {
//     arr = arr.map((v, i) => (v + (arr[i + 1] ?? v) + (arr[i - 1] ?? v)) / 3);
//   }
//   return arr;
// };

// export const simpleMovingAverage = (data, windowSize) => {
//   const smoothed = new Array(data.length).fill(0);
//   for (let i = 0; i < data.length; i++) {
//     const start = Math.max(i - Math.floor(windowSize / 2), 0);
//     const end = Math.min(i + Math.floor(windowSize / 2) + 1, data.length);

//     let sum = 0;
//     for (let j = start; j < end; j++) sum += data[j];

//     smoothed[i] = sum / (end - start);
//   }

//   return smoothed;
// };
