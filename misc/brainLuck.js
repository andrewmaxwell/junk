const getBracketMatches = (code) => {
  const result = {};
  const stack = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '[') stack.push(i);
    else if (code[i] === ']') {
      const start = stack.pop();
      result[start] = i;
      result[i] = start;
    }
  }
  return result;
};

function brainLuck(code, input) {
  const bracketMatches = getBracketMatches(code);
  const data = new Int8Array(3000);
  let p = 0;
  let n = 0;
  let output = '';
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '>') p++;
    else if (code[i] === '<') p--;
    else if (code[i] === '+') data[p] = (data[p] + 1) % 256;
    else if (code[i] === '-') data[p] = (data[p] + 255) % 256;
    else if (code[i] === '.') output += String.fromCharCode(data[p]);
    else if (code[i] === ',') data[p] = input.charCodeAt(n++);
    else if (code[i] === '[' && !data[p]) i = bracketMatches[i];
    else if (code[i] === ']' && data[p]) i = bracketMatches[i];
  }
  return output;
}

import {Test} from './test.js';

// Echo until byte(255) encountred
Test.assertEquals(
  brainLuck(',+[-.,+]', 'Codewars' + String.fromCharCode(255)),
  'Codewars'
);

// Echo until byte(0) encountred
Test.assertEquals(
  brainLuck(',[.[-],]', 'Codewars' + String.fromCharCode(0)),
  'Codewars'
);

// Two numbers multiplier
Test.assertEquals(
  brainLuck(',>,<[>[->+>+<<]>>[-<<+>>]<<<-]>>.', String.fromCharCode(8, 9)),
  String.fromCharCode(72)
);
