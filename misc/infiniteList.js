class List {
  constructor(list) {
    this.list = list;
  }
  toList() {
    return this.list;
  }
  head() {
    return this.get(0);
  }
  tail() {
    return this.slice(1);
  }
  init() {
    return this.slice(0, -1);
  }
  get(index) {
    return this.list[index];
  }
  take(num) {
    return this.slice(0, Math.max(0, num));
  }
  drop(num) {
    return this.slice(Math.max(0, num));
  }
  length() {
    return this.list.length;
  }
  nil() {
    return !this.length();
  }
  cons(x) {
    return new List([x, ...this.list]);
  }
  append(x) {
    return new List([...this.list, ...x.list]);
  }
  slice(i, j) {
    return new List(this.list.slice(i, j));
  }
  map(func) {
    return new List(this.list.map(func));
  }
  filter(func) {
    return new List(this.list.filter(func));
  }
  reverse() {
    return new List(this.list.slice().reverse());
  }
  concat() {
    return new List(this.list.flatMap((el) => el.list));
  }
  zipWith(func, list) {
    const res = [];
    for (let i = 0; i < list.length() && i < this.length(); i++) {
      res[i] = func(this.get(i), list.get(i));
    }
    return new List(res);
  }
  foldr(func, initial) {
    return this.list.reduceRight((res, el) => func(el, res), initial);
  }
  foldl(func, initial) {
    return this.list.reduce(func, initial);
  }
  scanr(func, initial) {
    return this.nil()
      ? new List([initial])
      : this.init()
          .scanr(func, func(initial, this.last()))
          .append(new List([initial]));
  }
  scanl(func, initial) {
    return this.nil()
      ? new List([initial])
      : this.slice(1).scanl(func, func(this.head(), initial)).cons(initial);
  }
  elem(x) {
    return this.list.includes(x);
  }
  elemIndex(x) {
    return this.list.indexOf(x);
  }
  find(func) {
    return this.list.find(func);
  }
  findIndex(func) {
    return this.list.findIndex(func);
  }
  any(func) {
    return this.list.some(func);
  }
  all(func) {
    return this.list.every(func);
  }
  the() {
    return this.list.every((v) => v === this.head()) ? this.head() : undefined;
  }
  concatMap(func) {
    return this.map(func).concat();
  }
  last() {
    return this.list[this.length() - 1];
  }
}
List.empty = new List([]);
List.fromList = (list) => new List(list);

const maxLen = 1001;
List.repeat = (x) => new List([...Array(maxLen)].fill(x));
List.iterate = (func, initial) => {
  const res = [initial];
  for (let i = 0; i < maxLen; i++) res.push(func(res[res.length - 1]));
  return new List(res);
};
List.cycle = (list) => {
  const res = [];
  for (let i = 0; i < maxLen; i++) res.push(list.get(i % list.length()));
  return new List(res);
};
List.replicate = (count, x) => new List(new Array(count).fill(x));
List.PRIME = (() => {
  const arr = [];
  const res = [];
  for (let i = 2; i < 1e6; i++) {
    if (arr[i] !== undefined) continue;
    res.push(i);
    for (let j = 2 * i; j < 1e6; j += i) arr[j] = 1;
  }
  return new List(res);
})();
List.FIB = (() => {
  const res = [0, 1];
  for (let i = 0; i < maxLen; i++) {
    res.push(res[res.length - 1] + res[res.length - 2]);
  }
  return new List(res);
})();
List.PI = (() => {
  const res = [0];
  for (let i = 0; i < maxLen; i++) {
    res.push(
      res[i] +
        ((-1) ** i * (4 * (0.5 ** (i * 2 + 1) + (1 / 3) ** (i * 2 + 1)))) /
          (i * 2 + 1)
    );
  }
  return new List(res);
})();

console.log(List.PI.list);

///////////////////////////////////////////////
const {Test} = require('./test');
const plus = (v, w) => v + w,
  times = (v, w) => v * w,
  inc = (x) => x + 1,
  id = (x) => x;
Test.assertDeepEquals(List.empty.toList(), []);
Test.assertDeepEquals(List.fromList([]).toList(), []);
Test.assertDeepEquals(List.fromList([1, 2, 3]).toList(), [1, 2, 3]);
Test.assertDeepEquals(List.fromList([1, 2, 3]).head(), 1);
Test.assertDeepEquals(List.fromList([]).head(), undefined);
Test.assertDeepEquals(List.fromList([1, 2, 3]).tail().toList(), [2, 3]);
Test.assertDeepEquals(List.fromList([]).tail().toList(), []);
Test.assertDeepEquals(List.fromList([1, 2, 3]).get(0), 1);
Test.assertDeepEquals(List.fromList([1, 2, 3]).get(1), 2);
Test.assertDeepEquals(List.fromList([1, 2, 3]).get(2), 3);
Test.assertDeepEquals(List.fromList([1, 2, 3, 4]).take(3).toList(), [1, 2, 3]);
Test.assertDeepEquals(List.fromList([1, 2, 3, 4]).drop(1).toList(), [2, 3, 4]);
Test.assertDeepEquals(List.empty.length(), 0);
Test.assertDeepEquals(List.fromList([1]).length(), 1);
Test.assertDeepEquals(List.fromList([1, 2]).length(), 2);
Test.assertDeepEquals(List.empty.nil(), true);
Test.assertDeepEquals(List.fromList([1]).nil(), false);
Test.assertDeepEquals(List.fromList([1, 2]).nil(), false);
Test.assertDeepEquals(List.fromList([2, 3]).cons(1).toList(), [1, 2, 3]);
Test.assertDeepEquals(List.empty.cons(1).toList(), [1]);
Test.assertDeepEquals(List.empty.append(List.empty).toList(), []);
Test.assertDeepEquals(List.empty.append(List.fromList([1, 2, 3])).toList(), [
  1,
  2,
  3,
]);
Test.assertDeepEquals(List.fromList([1, 2, 3]).append(List.empty).toList(), [
  1,
  2,
  3,
]);
Test.assertDeepEquals(
  List.fromList([1, 2, 3])
    .append(List.fromList([1, 2, 3]))
    .toList(),
  [1, 2, 3, 1, 2, 3]
);
Test.assertDeepEquals(List.fromList([1, 2, 3]).slice(1).toList(), [2, 3]);
Test.assertDeepEquals(List.fromList([1, 2, 3]).slice(1, 2).toList(), [2]);
Test.assertDeepEquals(List.fromList([1, 2, 3]).slice().toList(), [1, 2, 3]);
Test.assertDeepEquals(
  List.fromList([1, 2, 3])
    .map((x) => x * x)
    .toList(),
  [1, 4, 9]
);
Test.assertDeepEquals(
  List.fromList([1, 2, 3])
    .filter((x) => Boolean(x & 1))
    .toList(),
  [1, 3]
);
Test.assertDeepEquals(
  List.fromList([1, 2, 3])
    .filter((x) => !(x & 1))
    .toList(),
  [2]
);
Test.assertDeepEquals(List.fromList([1, 2, 3]).reverse().toList(), [3, 2, 1]);
Test.assertDeepEquals(
  List.fromList([List.fromList([1, 2, 3]), List.fromList([1, 2, 3])])
    .concat()
    .toList(),
  [1, 2, 3, 1, 2, 3]
);
Test.assertDeepEquals(List.empty.concat().toList(), []);
Test.assertDeepEquals(
  List.fromList([1, 2, 3])
    .zipWith(times, List.fromList([3, 2, 1]))
    .toList(),
  [3, 4, 3]
);
Test.assertDeepEquals(
  List.fromList([1, 2, 3])
    .foldr((x, z) => z.cons(x), List.empty)
    .toList(),
  [1, 2, 3]
);
Test.assertDeepEquals(
  List.empty.foldr(() => _ | _, Math.E),
  Math.E
);
Test.assertDeepEquals(List.fromList([1, 2, 3]).foldl(plus, 0), 6);
Test.assertDeepEquals(
  List.fromList([1, 2, 3]).foldl(inc, 0),
  List.fromList([1, 2, 3]).length()
);

Test.assertDeepEquals(List.fromList([1, 2, 3]).scanr(plus, 0).toList(), [
  6,
  5,
  3,
  0,
]);
Test.assertDeepEquals(List.empty.scanr(times, 1).toList(), [1]);
Test.assertDeepEquals(List.fromList([1, 2, 3]).scanl(plus, 0).toList(), [
  0,
  1,
  3,
  6,
]);
Test.assertDeepEquals(List.empty.scanl(times, 1).toList(), [1]);
Test.assertDeepEquals(List.fromList([1, 2, 3]).elem(0), false);
Test.assertDeepEquals(List.fromList([1, 2, 3]).elem(2), true);
Test.assertDeepEquals(List.empty.elem(0), false);
Test.assertDeepEquals(List.fromList([1, 2, 3]).elemIndex(0), -1);
Test.assertDeepEquals(List.fromList([1, 2, 3]).elemIndex(2), 1);
Test.assertDeepEquals(List.empty.elemIndex(0), -1);
Test.assertDeepEquals(
  List.fromList([1, 2, 3]).find((x) => !(x & 1)),
  2
);
Test.assertDeepEquals(
  List.fromList([1, 3]).find((x) => !(x & 1)),
  undefined
);
Test.assertDeepEquals(
  List.empty.find((x) => !(x & 1)),
  undefined
);
Test.assertDeepEquals(
  List.fromList([1, 2, 3]).findIndex((x) => !(x & 1)),
  1
);
Test.assertDeepEquals(
  List.fromList([1, 3]).find((x) => !(x & 1)),
  undefined
);
Test.assertDeepEquals(
  List.empty.find((x) => !(x & 1)),
  undefined
);
Test.assertDeepEquals(List.fromList([true, false]).any(id), true);
Test.assertDeepEquals(List.empty.any(id), false);
Test.assertDeepEquals(List.fromList([true, false]).all(id), false);
Test.assertDeepEquals(List.empty.all(id), true);
Test.assertDeepEquals(List.fromList([1, 2, 3]).the(), undefined);
Test.assertDeepEquals(List.fromList([1, 1, 1]).the(), 1);
Test.assertDeepEquals(List.empty.the(), undefined);

Test.assertDeepEquals(List.repeat(1).take(10).toList(), [
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
]);
Test.assertDeepEquals(List.repeat(2).take(10).toList(), [
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
]);
Test.assertDeepEquals(List.repeat(3).take(10).toList(), [
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
]);
Test.assertDeepEquals(List.iterate(inc, 0).take(10).toList(), [
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
]);
Test.assertDeepEquals(
  List.cycle(List.fromList([1, 2, 3]))
    .take(10)
    .toList(),
  [1, 2, 3, 1, 2, 3, 1, 2, 3, 1]
);
Test.assertDeepEquals(List.replicate(10, 1).toList(), [
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
]);
Test.assertDeepEquals(List.replicate(10, 2).toList(), [
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
]);
Test.assertDeepEquals(List.replicate(10, 3).toList(), [
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
]);
Test.assertDeepEquals(
  List.replicate(0, undefined).toList(),
  List.empty.toList()
);
Test.assertDeepEquals(
  List.replicate(10, 1).toList(),
  List.iterate(id, 1).take(10).toList()
);

Test.assertDeepEquals(
  List.fromList([1, 2, 3])
    .concatMap((n) => List.replicate(n, n))
    .toList(),
  [1, 2, 2, 3, 3, 3]
);
