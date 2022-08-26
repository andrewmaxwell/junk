const outputToString = (arr) => {
  let result = '';
  for (let i = 0; i < arr.length; i += 8) {
    let num = 0;
    for (let j = i + 7; j >= i; j--) {
      num = num * 2 + (Number(arr[j]) || 0);
    }
    result += String.fromCharCode(num);
  }
  return result;
};

const getMatchingBracketIndexes = (code) => {
  const stack = [];
  const indexes = {};
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '[') stack.push(i);
    else if (code[i] === ']') {
      const start = stack.pop();
      indexes[i] = start;
      indexes[start] = i;
    }
  }
  return indexes;
};

const convertInput = (input) =>
  [...input]
    .map((c) => c.charCodeAt(0).toString(2).padStart(8, 0).split('').reverse())
    .reduce((a, b) => [...a, ...b], [])
    .map(Number)
    .reverse();

const boolfuck = (code, input = '') => {
  const matchingBracketIndexes = getMatchingBracketIndexes(code);
  const inputArr = convertInput(input);
  const data = {};
  const output = [];
  let dataPointer = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '+') data[dataPointer] = !data[dataPointer];
    else if (code[i] === ';') output.push(data[dataPointer]);
    else if (code[i] === '>') dataPointer++;
    else if (code[i] === '<') dataPointer--;
    else if (
      (code[i] === '[' && !data[dataPointer]) ||
      (code[i] === ']' && data[dataPointer])
    )
      i = matchingBracketIndexes[i];
    else if (code[i] === ',') data[dataPointer] = inputArr.pop() || 0;
  }

  return outputToString(output);
};

import {Test} from './test.js';
Test.assertEquals(
  boolfuck(`;;;+;+;;+;+;
+;+;+;+;;+;;+;
;;+;;+;+;;+;
;;+;;+;+;;+;
+;;;;+;+;;+;
;;+;;+;+;+;;
;;;;;+;+;;
+;;;+;+;;;+;
+;;;;+;+;;+;
;+;+;;+;;;+;
;;+;;+;+;;+;
;;+;+;;+;;+;
+;+;;;;+;+;;
;+;+;+;`),
  'Hello, world!\n'
);

Test.assertEquals(
  boolfuck(
    '>,>,>,>,>,>,>,>,<<<<<<<[>]+<[+<]>>>>>>>>>[+]+<<<<<<<<+[>+]<[<]>>>>>>>>>[+<<<<<<<<[>]+<[+<]>>>>>>>>>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+]<<<<<<<<;>;>;>;>;>;>;>;<<<<<<<,>,>,>,>,>,>,>,<<<<<<<[>]+<[+<]>>>>>>>>>[+]+<<<<<<<<+[>+]<[<]>>>>>>>>>]<[+<]',
    'Codewars' + String.fromCharCode(255)
  ),
  'Codewars'
);

Test.assertEquals(
  boolfuck(
    '>,>,>,>,>,>,>,>,>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+<<<<<<<<[>]+<[+<]>;>;>;>;>;>;>;>;>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+<<<<<<<<[>]+<[+<]>>>>>>>>>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+]+<<<<<<<<+[>+]<[<]>>>>>>>>>]<[+<]>,>,>,>,>,>,>,>,>+<<<<<<<<+[>+]<[<]>>>>>>>>>]<[+<]',
    'Codewars' + String.fromCharCode(0)
  ),
  'Codewars'
);
// Two numbers multiplier
Test.assertEquals(
  boolfuck(
    '>,>,>,>,>,>,>,>,>>,>,>,>,>,>,>,>,<<<<<<<<+<<<<<<<<+[>+]<[<]>>>>>>>>>[+<<<<<<<<[>]+<[+<]>>>>>>>>>>>>>>>>>>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+<<<<<<<<[>]+<[+<]>>>>>>>>>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+]>[>]+<[+<]>>>>>>>>>[+]>[>]+<[+<]>>>>>>>>>[+]<<<<<<<<<<<<<<<<<<+<<<<<<<<+[>+]<[<]>>>>>>>>>]<[+<]>>>>>>>>>>>>>>>>>>>>>>>>>>>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+<<<<<<<<[>]+<[+<]>>>>>>>>>+<<<<<<<<+[>+]<[<]>>>>>>>>>[+]<<<<<<<<<<<<<<<<<<<<<<<<<<[>]+<[+<]>>>>>>>>>[+]>>>>>>>>>>>>>>>>>>+<<<<<<<<+[>+]<[<]>>>>>>>>>]<[+<]<<<<<<<<<<<<<<<<<<+<<<<<<<<+[>+]<[<]>>>>>>>>>[+]+<<<<<<<<+[>+]<[<]>>>>>>>>>]<[+<]>>>>>>>>>>>>>>>>>>>;>;>;>;>;>;>;>;<<<<<<<<',
    String.fromCharCode(8, 9)
  ),
  String.fromCharCode(72)
);
