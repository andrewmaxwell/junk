import {Test} from './test.js';

const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '(' && tokens[i - 1] !== '\\')
      indexes.push(result.length);
    else if (tokens[i] === ')' && tokens[i - 1] !== '\\') {
      if (!indexes.length) throw new Error('Unexpected )');
      result.push(result.splice(indexes.pop()));
    } else result.push(tokens[i]);
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} )`);
  return result;
};

const split = (arr, delimiter) => {
  const result = [[]];
  for (const el of arr) {
    if (el === delimiter) result.push([]);
    else result[result.length - 1].push(el);
  }
  return result;
};

const getMaxNodeNum = (arr) =>
  arr.reduce(
    (x, {to, from}) => Math.max(Math.max(x, isNaN(to) ? 0 : to, from)),
    0
  );

const increaseNodeNums = (arr, x) =>
  arr.map((r) => ({
    ...r,
    from: r.from ? r.from + x : 0, // don't touch zeros
    to: isNaN(r.to) ? r.to : r.to + x, // don't touch 'end'
  }));

const classes = {
  '.': (x) => x !== '\n',
  '\\s': (x) => ' \t\r\n'.includes(x),
};

const astToArr = (arr, startAtNodeNum = 0) => {
  if (Array.isArray(arr) && arr.length === 1) {
    return astToArr(arr[0]);
  }

  if (arr.includes('|')) {
    return split(arr, '|')
      .map((el) => astToArr(el))
      .reduce((a, b) => [...a, ...increaseNodeNums(b, getMaxNodeNum(a))], []);
  }

  const nodes = [];

  let currentNodeNum = startAtNodeNum;

  for (let i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) {
      nodes.push(...astToArr(arr[i], currentNodeNum));
      currentNodeNum = getMaxNodeNum(nodes) + 1;
      continue;
    }

    const escaped = arr[i] === '\\';
    if (escaped) i++;

    const val = Array.isArray(arr[i]) ? astToArr(arr[i]) : arr[i];

    const props =
      escaped && classes['\\' + val]
        ? {char: '\\' + val, func: classes['\\' + val]}
        : !escaped && classes[val]
        ? {char: val, func: classes[val]}
        : {char: val};

    const to = i === arr.length - 1 ? 'end' : currentNodeNum + 1;
    if (arr[i + 1] === '*') {
      nodes.push(
        {from: currentNodeNum, to: currentNodeNum, ...props},
        {from: currentNodeNum, to}
      );
      i++;
    } else {
      nodes.push({from: currentNodeNum, to, ...props});
      if (arr[i + 1] === '?') {
        nodes.push({from: currentNodeNum, to});
        i++;
      } else if (arr[i + 1] === '+') {
        nodes.push({from: to, to, ...props});
        i++;
      }
    }
    currentNodeNum = to;
  }

  return nodes;
};

const compileRegex = (str) => astToArr(nest(str));

let tests = {
  a: [{from: 0, to: 'end', char: 'a'}],
  ab: [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 'end', char: 'b'},
  ],
  'ab*c': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 1, char: 'b'},
    {from: 1, to: 'end', char: 'c'},
  ],
  'ab?c': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 2, char: 'b'},
    {from: 1, to: 2},
    {from: 2, to: 'end', char: 'c'},
  ],
  'ab+c': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 2, char: 'b'},
    {from: 2, to: 2, char: 'b'},
    {from: 2, to: 'end', char: 'c'},
  ],
  'a.c': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 2, char: '.', func: classes['.']},
    {from: 2, to: 'end', char: 'c'},
  ],
  'a\\.c': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 2, char: '.'},
    {from: 2, to: 'end', char: 'c'},
  ],
  'a\\sc': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 2, char: '\\s', func: classes['\\s']},
    {from: 2, to: 'end', char: 'c'},
  ],
  'a|b': [
    {from: 0, to: 'end', char: 'a'},
    {from: 0, to: 'end', char: 'b'},
  ],
  'ac|bd': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 'end', char: 'c'},
    {from: 0, to: 2, char: 'b'},
    {from: 2, to: 'end', char: 'd'},
  ],
  'ab?c|cde': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 2, char: 'b'},
    {from: 1, to: 2},
    {from: 2, to: 'end', char: 'c'},
    {from: 0, to: 3, char: 'c'},
    {from: 3, to: 4, char: 'd'},
    {from: 4, to: 'end', char: 'e'},
  ],
  '(a)': [{from: 0, to: 'end', char: 'a'}],
  'a(bc)': [
    {from: 0, to: 1, char: 'a'},
    {from: 1, to: 2, char: 'b'},
    {from: 2, to: 'end', char: 'c'},
  ],
  'a*b*': [
    {from: 0, to: 0, char: 'a'},
    {from: 0, to: 1},
    {from: 1, to: 1, char: 'b'},
    {from: 1, to: 'end'},
  ],
  // 'a(b|c)d': [
  //   {from: 0, to: 1, char: 'a'},
  //   {from: 1, to: 2, char: 'b'},
  //   {from: 1, to: 2, char: 'c'},
  //   {from: 2, to: 'end', char: 'd'},
  // ],
};

// for (const key in tests) tests[`(${key})`] = tests[key];

for (const [input, expected] of Object.entries(tests)) {
  Test.assertDeepEquals(compileRegex(input), expected, input);
}

// const regTest = (regex, input) => {
//   const q = [...input].map((v, i) => ({inputIndex: i, node: 0}));
//   for (const {inputIndex, node} of q) {
//     if (inputIndex === input.length) continue;
//     for (const {from, to, char} of regex) {
//       if (from === node && (!char || char === input[inputIndex])) {
//         if (to === 'end') return true;
//         q.push({inputIndex: inputIndex + 1, node: to});
//       }
//     }
//   }
//   return false;
// };

// // const r = regex('ab*c');
// const r1 = [
//   {from: 0, to: 1, char: 'a'},
//   {from: 1, to: 1, char: 'b'},
//   {from: 1, to: 'end', char: 'c'},
// ];

// Test.assertEquals(regTest(r1, 'abc'), true);
// Test.assertEquals(regTest(r1, 'ac'), true);
// Test.assertEquals(regTest(r1, 'abbbbc'), true);
// Test.assertEquals(regTest(r1, 'xabcx'), true);

// Test.assertEquals(regTest(r1, 'abbbbdc'), false);
// Test.assertEquals(regTest(r1, 'bbbbc'), false);
// Test.assertEquals(regTest(r1, 'a'), false);
// Test.assertEquals(regTest(r1, 'ab'), false);

// // const r2 = regex('a(b|c)+d');
// const r2 = [
//   {from: 0, to: 1, char: 'a'},
//   {from: 1, to: 2, char: 'b'},
//   {from: 1, to: 2, char: 'c'},
//   {from: 2, to: 2, char: 'b'},
//   {from: 2, to: 2, char: 'c'},
//   {from: 2, to: 'end', char: 'd'},
// ];

// Test.assertEquals(regTest(r2, 'abd'), true);
// Test.assertEquals(regTest(r2, 'abcd'), true);
// Test.assertEquals(regTest(r2, 'abccd'), true);
// Test.assertEquals(regTest(r2, 'abccbd'), true);
// Test.assertEquals(regTest(r2, 'abccbbbbd'), true);
// Test.assertEquals(regTest(r2, 'accbccbbbbcd'), true);
// Test.assertEquals(regTest(r2, 'xxaccbccbbbbcdxx'), true);
// Test.assertEquals(regTest(r2, 'ad'), false);
// Test.assertEquals(regTest(r2, 'axd'), false);
// Test.assertEquals(regTest(r2, 'abcbc'), false);
// Test.assertEquals(regTest(r2, 'abcbcxd'), false);
