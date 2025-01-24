const cross = ([a, b], [c, d], [e, f]) => (c - a) * (f - b) - (d - b) * (e - a);
const dist = ([a, b], [c, d]) => Math.hypot(a - c, b - d);

const hullMethod = (points) => {
  const start = points.reduce(([a, b], [c, d]) =>
    d < b || (d === b && c < a) ? [c, d] : [a, b]
  );

  return points
    .sort((a, b) => cross(start, a, b) || dist(start, a) - dist(start, b))
    .reduce((hull, p) => {
      while (
        hull.length > 1 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], p) >= 0
      )
        hull.pop();
      return [...hull, p];
    }, []);
};

import {Test} from './test.js';

function sortingFunction(a, b) {
  let n = a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0;
  return n ? n : a[1] > b[1] ? 1 : -1;
}

const expected = [
  [0, 0],
  [0, 5],
  [5, 3],
];

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
