const car = (arr) => arr[0];
const cdr = (arr) => arr.slice(1);

const getProp = (key, pairs) =>
  !pairs.length
    ? 0
    : car(car(pairs)) === key
    ? car(cdr(car(pairs)))
    : getProp(key, cdr(pairs));

const getIndex = (index, arr) =>
  index > 0 ? getIndex(index - 1, cdr(arr)) : car(arr);

const incProp = (key, pairs) =>
  !pairs.length
    ? [[key, 1]]
    : car(car(pairs)) === key
    ? [[key, car(cdr(car(pairs))) + 1], ...cdr(pairs)]
    : [car(pairs), ...incProp(key, cdr(pairs))];

const decProp = (key, pairs) =>
  !pairs.length
    ? [[key, -1]]
    : car(car(pairs)) === key
    ? [[key, car(cdr(car(pairs))) - 1], ...cdr(pairs)]
    : [car(pairs), ...decProp(key, cdr(pairs))];

const uniq = (arr) => [...new Set(arr)];
const getCounts = (str, res = []) =>
  str.length ? getCounts(cdr(str), incProp(car(str), res)) : res;

const _shrinkLeft = (
  sourceStr,
  targetCounts,
  windowCounts,
  rightIndex,
  leftIndex,
  numRemaining,
  result
) =>
  numRemaining
    ? _findMinWindow(
        sourceStr,
        targetCounts,
        windowCounts,
        rightIndex + 1,
        leftIndex,
        numRemaining,
        result
      )
    : _shrinkLeft(
        sourceStr,
        targetCounts,
        decProp(getIndex(leftIndex, sourceStr), windowCounts),
        rightIndex,
        leftIndex + 1,
        numRemaining +
          (getProp(getIndex(leftIndex, sourceStr), windowCounts) - 1 <
            getProp(getIndex(leftIndex, sourceStr), targetCounts)),
        !result || rightIndex - leftIndex + 1 < result.length
          ? sourceStr.slice(leftIndex, rightIndex + 1)
          : result
      );

const _findMinWindow = (
  sourceStr,
  targetCounts,
  windowCounts,
  rightIndex,
  leftIndex,
  numRemaining,
  result
) =>
  rightIndex >= sourceStr.length
    ? result
    : _shrinkLeft(
        sourceStr,
        targetCounts,
        incProp(getIndex(rightIndex, sourceStr), windowCounts),
        rightIndex,
        leftIndex,
        numRemaining -
          (getProp(getIndex(rightIndex, sourceStr), windowCounts) + 1 ===
            getProp(getIndex(rightIndex, sourceStr), targetCounts)),
        result
      );

const minWindow = (sourceStr, neededChars) =>
  _findMinWindow(
    sourceStr,
    getCounts(neededChars),
    [],
    0,
    0,
    uniq(neededChars).length,
    ''
  );

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
