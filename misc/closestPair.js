const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

function bruteForce(points) {
  let result = {min: Infinity};
  for (let i = 0; i < points.length; ++i) {
    for (let j = i + 1; j < points.length; ++j) {
      const d = dist(points[i], points[j]);
      if (d < result.min) {
        result = {min: d, a: points[i], b: points[j]};
      }
    }
  }
  return result;
}

function stripClosest(strip, bestSoFar) {
  for (let i = 0; i < strip.length; ++i) {
    for (let j = i + 1; j < strip.length; ++j) {
      if (strip[j].y - strip[i].y >= bestSoFar.min) break;
      const d = dist(strip[i], strip[j]);
      if (d < bestSoFar.min) {
        bestSoFar = {min: d, a: strip[i], b: strip[j]};
      }
    }
  }
  return bestSoFar;
}

function closestPairRec(pointsLeftToRight, pointsTopToBottom) {
  if (pointsLeftToRight.length <= 3) {
    return bruteForce(pointsLeftToRight);
  }

  const halfLen = Math.floor(pointsLeftToRight.length / 2);
  const mid = pointsLeftToRight[halfLen];

  const pointsYLeft = [];
  const pointsYRight = [];
  for (const p of pointsTopToBottom) {
    const onLeft =
      (p.x < mid.x || (p.x === mid.x && p.y < mid.y)) &&
      pointsYLeft.length < halfLen;
    (onLeft ? pointsYLeft : pointsYRight).push(p);
  }

  const left = closestPairRec(pointsLeftToRight.slice(0, halfLen), pointsYLeft);
  const right = closestPairRec(pointsLeftToRight.slice(halfLen), pointsYRight);
  const minDist = Math.min(left.min, right.min);
  const strip = pointsTopToBottom.filter(
    (p) => Math.abs(p.x - mid.x) < minDist
  );

  return stripClosest(strip, left.min < right.min ? left : right);
}

const closestPair = (points) =>
  closestPairRec(
    [...points].sort((a, b) => a.x - b.x || a.y - b.y),
    [...points].sort((a, b) => a.y - b.y || a.x - b.x)
  );

////////////////

const getMin = (num) => {
  const points = [];
  for (let i = 0; i < num; i++) {
    points[i] = {
      x: Math.random() * 100,
      y: Math.random() * 100,
    };
  }
  return closestPair(points).min;
};

const iterations = 10000;
for (let numPoints = 2; numPoints < 1000; numPoints++) {
  let total = 0;
  for (let j = 0; j < iterations; j++) {
    total += getMin(numPoints);
  }
  const mean = total / iterations;
  console.log(
    numPoints.toString().padStart(2),
    '*'.repeat(Math.round(mean)),
    mean.toFixed(2)
  );
}

// const points = [...Array(100).keys()].map(() => ({
//   x: Math.random() * 100,
//   y: Math.random() * 100,
// }));

// const result1 = closestPair(points);
// console.log(result1);
