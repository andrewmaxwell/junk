const isOuter = ([x1, y1], [x2, y2], points) => {
  const m = (y2 - y1) / (x2 - x1);
  let count = 0;
  for (const [x, y] of points) {
    count += x2 === x1 ? x >= x1 : y - y1 >= m * (x - x1);
  }
  return !count || count === points.length;
};

function hullMethod(points) {
  const seen = {};
  points = points.filter((p) => !seen[p] && (seen[p] = true));

  const outer = new Set();
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (isOuter(points[i], points[j], points)) {
        outer.add(points[i]).add(points[j]);
      }
    }
  }
  return [...outer];
}

const expected = [
  [0, 0],
  [0, 5],
  [5, 3],
];

const {Test} = require('./test');

function sortingFunction(a, b) {
  let n = a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0;
  return n ? n : a[1] > b[1] ? 1 : -1;
}

let result = hullMethod([
  [0, 0],
  [5, 3],
  [0, 5],
]).sort(sortingFunction);
Test.assertDeepEquals(result, expected, 'Three points');

result = hullMethod([
  [0, 0],
  [5, 3],
  [0, 5],
  [2, 3],
]).sort(sortingFunction);
Test.assertDeepEquals(result, expected, 'As first case with central point');

result = hullMethod([
  [0, 0],
  [5, 3],
  [0, 5],
  [0, 3],
]).sort(sortingFunction);
Test.assertDeepEquals(result, expected, 'As first case with colinear point');

result = hullMethod([
  [0, 0],
  [5, 3],
  [0, 5],
  [5, 3],
]).sort(sortingFunction);
Test.assertDeepEquals(
  result,
  expected,
  'As first case with a duplicated point'
);

result = hullMethod([
  [0, 0],
  [5, 3],
  [0, 5],
  [0, 3],
  [2, 3],
  [5, 3],
]).sort(sortingFunction);
Test.assertDeepEquals(
  result,
  expected,
  'Central point, colinear point and duplicated point'
);
