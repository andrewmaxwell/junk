export const makeHistogram = (vals, numBuckets = 32, width = 100) => {
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
