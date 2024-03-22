import {
  converge,
  prop,
  lt,
  equals,
  subtract,
  pipe,
  not,
  or,
  slice,
  ifElse,
  identity,
  when,
  uniq,
  inc,
  dec,
  assoc,
  groupBy,
  map,
  length,
  over,
  lensPath,
  defaultTo,
  pair,
  __,
  lensProp,
} from 'ramda';

// const curry =
//   (func, n = func.length) =>
//   (...a) =>
//     a.length >= n
//       ? func(...a)
//       : curry((...b) => func(...a, ...b), n - a.length);
// const prop = curry((prop, obj) => obj[prop] ?? 0);
// const propOr = curry((defaultVal, prop, obj) => obj[prop] ?? defaultVal);
// const inc = (x) => x + 1;
// const dec = (x) => x - 1;
// const identity = (x) => x;
// const always = (x) => () => x;
// const assoc = curry((key, val, obj) => ({...obj, [key]: val}));
// const converge = (func, funcs) => (data) => func(...funcs.map((f) => f(data)));
// const uniq = (arr) => [...new Set(arr)];
// const when = (pred, func) => (data) => pred(data) ? func(data) : data;
// const ifElse = (pred, thenFunc, elseFunc) => (data) =>
//   pred(data) ? thenFunc(data) : elseFunc(data);
// const pipe =
//   (...funcs) =>
//   (data) =>
//     funcs.reduce((v, f) => f(v), data);
// const slice = curry((start, end, arr) => arr.slice(start, end));
// const not = (a) => !a;
// const or = curry((a, b) => a || b);
// const lt = curry((a, b) => a < b);
// const equals = curry((a, b) => a === b);
// const subtract = curry((a, b) => a - b);
// const groupBy = curry((keyFunc, data) =>
//   data.reduce((res, el) => {
//     (res[keyFunc(el)] ||= []).push(el);
//     return res;
//   }, {})
// );
// const map = curry((func, data) => {
//   const result = Array.isArray(data) ? [] : {};
//   for (const key in data) result[key] = func(data[key]);
//   return result;
// });
// const length = (arr) => arr.length;

///////////

const incProp = pipe(lensProp, over(__, inc));
const decProp = pipe(lensProp, over(__, dec));
const getCounts = pipe(groupBy(identity), map(length));
const getLeftChar = converge(prop, [prop('leftIndex'), prop('sourceStr')]);
const getRightChar = converge(prop, [prop('rightIndex'), prop('sourceStr')]);
const needMore = converge(lt, [
  converge(prop, [getLeftChar, prop('windowCounts')]),
  converge(prop, [getLeftChar, prop('targetCounts')]),
]);
const hasEnough = converge(equals, [
  converge(prop, [getRightChar, prop('windowCounts')]),
  converge(prop, [getRightChar, prop('targetCounts')]),
]);
const resultIsEmpty = pipe(prop('result'), not);
const resultLength = pipe(prop('result'), prop('length'));
const windowLength = converge(subtract, [
  prop('rightIndex'),
  prop('leftIndex'),
]);
const betterThanResult = converge(or, [
  resultIsEmpty,
  converge(lt, [windowLength, resultLength]),
]);
const getWindowString = converge(slice, [
  prop('leftIndex'),
  prop('rightIndex'),
  prop('sourceStr'),
]);
const addRightToWindow = converge(over(__, pipe(defaultTo(0), inc), __), [
  pipe(getRightChar, pair('windowCounts'), lensPath),
  identity,
]);
const removeLeftFromWindow = converge(over(__, dec, __), [
  pipe(getLeftChar, pair('windowCounts'), lensPath),
  identity,
]);
const sourceLen = pipe(prop('sourceStr'), prop('length'));
const canExpandRight = converge(lt, [prop('rightIndex'), sourceLen]);
const saveResult = converge(assoc('result'), [getWindowString, identity]);

const shrinkLeft = ifElse(
  prop('numRemaining'),
  identity,
  pipe(
    removeLeftFromWindow,
    when(needMore, incProp('numRemaining')),
    when(betterThanResult, saveResult),
    incProp('leftIndex'),
    (o) => shrinkLeft(o) // can't be point-free :(
  )
);
const findMinWindow = ifElse(
  canExpandRight,
  pipe(
    addRightToWindow,
    when(hasEnough, decProp('numRemaining')),
    incProp('rightIndex'),
    shrinkLeft,
    (o) => findMinWindow(o) // can't be point-free :(
  ),
  prop('result')
);
const minWindow = (sourceStr, neededChars) =>
  findMinWindow({
    sourceStr,
    targetCounts: getCounts(neededChars),
    windowCounts: {},
    rightIndex: 0,
    leftIndex: 0,
    numRemaining: uniq(neededChars).length,
    result: '',
  });

import {Test} from './test.js';
Test.assertEquals(minWindow('a', 'a'), 'a');
Test.assertEquals(minWindow('a', 'aa'), ''); // 'a' does not contain 2 a's, return empty string
Test.assertEquals(minWindow('ab', 'a'), 'a');
Test.assertEquals(minWindow('ab', 'b'), 'b');
Test.assertEquals(minWindow('ab', 'b'), 'b');
Test.assertEquals(minWindow('xxaxxbxxcxxxxxacxxxbxxxxxx', 'abc'), 'acxxxb');
Test.assertEquals(
  minWindow(
    'ezsevejszgvxqqggbwkxpwzoyrbaslnxmfdjmmentzllptsspeshatvbkwbcjozwwcfirjxmiixadrsvwmcyfzzpxauhptdlyivrssdadacisxdojhopgogeoalfwoswypnqiqtnqxvkubaeiptpdzvtaizywtuwjhptxkgnhdaceagppbeuabocjpahiudrdskacsqmwqocqurivxcxyqcjfcqqzwheqsfvkxhinvlfrenmcslcinoqsggtcpxtjcowbveosrwjyjvcbigmwueobmjdbgynlojmjpbbjzmhkjjosraomgepsnuvvtkghtttlwwuxjdhsovmfvctdiixxdvtyfzhbuamszipklxezsrgqtavcitzloulvwtwqvklwscgfznguenmzphdxcdlqxwotrkmnxzjrbsxdffxlslkhsohxtupsqdokqaxnzieccdfhjesdpfnktuhoqwgicussurhvalaerfmakgfznslioswerdntxfnuxurzhrfyzrajagkpywypqutjzicxqrtplkqtevtdpuoraagayeppblyavdzluscifsblowqdqeuqectdjkukxumtzogwijenbhapdquuwqmbthgcscmpyaiyorwxaambjntmfnicexfzenbyppoppyngpjdplrtugojmbtqhsvixkjxbylqqmgwbpbtdsozzcinfedpwaxvkhtnhgdxsjtwburephdojodouifqkdowmjjtpmrkwmizjzdygioryrhsznllqbhekqxbeqlcdtbougmcpavptdkuqvfiymmieljkcxnhsovpvjrmjnbcqlwiidsirgqvrcfvbuctlzigicutrxxjlvrvylerrwmkaugbqkxbkhjujdqcdplolejlpndimrtmnzoelnfvupsgukixzwlkaxysmbayuvliubogotdkkxqhhbejxsvxrtpdwsetnrb',
    'ksrsimxsxxjegkkpj'
  ),
  'mnxzjrbsxdffxlslkhsohxtupsqdokqaxnzieccdfhjesdpfnktuhoqwg'
);
