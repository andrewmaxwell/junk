// nodemon jira/stats

const Papa = require('papaparse');
const {readFileSync} = require('fs');
// const sd = Math.sqrt(mean(values.map((value) => (value - m) ** 2)));

const makeHistogram = (vals, numBuckets = 32, width = 100) => {
  let min = Infinity;
  let max = -Infinity;
  for (const val of vals) {
    min = Math.min(min, val);
    max = Math.max(max, val);
  }

  const buckets = new Array(numBuckets + 1).fill(0);
  let maxInBucket = 0;
  for (const val of vals) {
    const x = Math.floor(((val - min) / (max - min)) * numBuckets);
    buckets[x]++;
    maxInBucket = Math.max(maxInBucket, buckets[x]);
  }

  return buckets
    .map((v, i) =>
      [
        '#'.repeat((v / maxInBucket) * width).padEnd(width, '.'),
        (v + 'x').padEnd(5),
        Math.round(((i / numBuckets) * (max - min) + min) * 100) / 100,
      ].join(' ')
    )
    .join('\n');
};

const mean = (vals) => vals.reduce((a, b) => a + b, 0) / vals.length;
const stDev = (vals) => {
  const m = mean(vals);
  return Math.sqrt(mean(vals.map((v) => (v - m) ** 2)));
};

const getStats = (data) => {
  const groups = data
    .filter((el) => el.estimate && el.days && el.finished > '2020')
    .reduce((res, el) => {
      const key = el.estimate;
      (res[key] = res[key] || []).push(el);
      return res;
    }, {});

  for (const [key, arr] of Object.entries(groups).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )) {
    if (arr.length < 3) continue;
    const vals = arr.map((x) => parseFloat(x.days)).sort((a, b) => a - b);
    const m = mean(vals);
    const sd = stDev(vals);
    const sansOutliers = vals.filter((v) => v > m - sd && v < m + sd);
    const m2 = mean(sansOutliers);
    const sd2 = stDev(sansOutliers);
    console.log(
      `It takes ${m2.toFixed(1)} +/- ${sd2.toFixed(
        1
      )} days to complete a ${key} pointer (${sansOutliers.length} stories)`
    );
    console.log(
      makeHistogram(
        arr.map((x) => parseFloat(x.days)),
        16,
        50
      )
    );
  }
};

const go = () => {
  const file = readFileSync('jira/data.csv').toString();
  const {data} = Papa.parse(file, {header: true});
  // console.log(data);
  getStats(data);
};
go();
