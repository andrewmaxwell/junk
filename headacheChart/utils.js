/** @param {Date} date */
export const nextMonth = (date) => {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + 1);
  newDate.setDate(1);
  return newDate;
};

/**
 * Calculate frequency of data points over a sliding window.
 * @param {Date[]} dates - Array of Date objects (assumed sorted).
 * @param {number} freqPeriod - Size of the sliding window (in milliseconds).
 * @param {number} resultLength - Length of the output array.
 * @param {(v: number) => number} [func] - Weighting function for distance from center (default is constant).
 * @returns {number[]} - Array representing frequency counts.
 */
export const calcFrequency = (
  dates,
  freqPeriod,
  resultLength,
  func = () => 1,
) => {
  const min = dates[0];
  const range = dates[dates.length - 1].getTime() - min.getTime();
  const winRad = (freqPeriod / range) * resultLength * 0.5;
  const result = new Array(resultLength).fill(0);

  for (const val of dates) {
    const x = ((val.getTime() - min.getTime()) / range) * resultLength;
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
