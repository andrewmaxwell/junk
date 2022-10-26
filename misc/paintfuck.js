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

function interpreter(code, iterations, width, height) {
  const matchingBracketIndexes = getMatchingBracketIndexes(code);
  const data = [];
  for (let i = 0; i < height; i++) {
    data[i] = [];
    for (let j = 0; j < width; j++) data[i][j] = 0;
  }
  let x = 0;
  let y = 0;
  let counter = 0;
  for (let i = 0; i < code.length && counter < iterations; i++) {
    const c = code[i];
    if ('nsew*[]'.includes(c)) {
      counter++;
      if (c === 'n') y = (y + height - 1) % height;
      else if (c === 's') y = (y + 1) % height;
      else if (c === 'e') x = (x + 1) % width;
      else if (c === 'w') x = (x + width - 1) % width;
      else if (c === '*') data[y][x] = !data[y][x];
      else if ((c === '[' && !data[y][x]) || (c === ']' && data[y][x]))
        i = matchingBracketIndexes[i];
    }
  }
  return data.map((r) => r.map(Number).join('')).join('\r\n');
}

import {Test, it} from './test.js';
it('should work for some example test cases', function () {
  Test.assertEquals(
    interpreter('*e*e*e*es*es*ws*ws*w*w*w*n*n*n*ssss*s*s*s*', 0, 6, 9),
    '000000\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000',
    'Your interpreter should initialize all cells in the datagrid to 0'
  );
  Test.assertEquals(
    interpreter('*e*e*e*es*es*ws*ws*w*w*w*n*n*n*ssss*s*s*s*', 7, 6, 9),
    '111100\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000\r\n000000',
    'Your interpreter should adhere to the number of iterations specified'
  );
  Test.assertEquals(
    interpreter('*e*e*e*es*es*ws*ws*w*w*w*n*n*n*ssss*s*s*s*', 19, 6, 9),
    '111100\r\n000010\r\n000001\r\n000010\r\n000100\r\n000000\r\n000000\r\n000000\r\n000000',
    'Your interpreter should traverse the 2D datagrid correctly'
  );
  Test.assertEquals(
    interpreter('*e*e*e*es*es*ws*ws*w*w*w*n*n*n*ssss*s*s*s*', 42, 6, 9),
    '111100\r\n100010\r\n100001\r\n100010\r\n111100\r\n100000\r\n100000\r\n100000\r\n100000',
    'Your interpreter should traverse the 2D datagrid correctly for all of the "n", "e", "s" and "w" commands'
  );
  Test.assertEquals(
    interpreter('*e*e*e*es*es*ws*ws*w*w*w*n*n*n*ssss*s*s*s*', 100, 6, 9),
    '111100\r\n100010\r\n100001\r\n100010\r\n111100\r\n100000\r\n100000\r\n100000\r\n100000',
    'Your interpreter should terminate normally and return a representation of the final state of the 2D datagrid when all commands have been considered from left to right even if the number of iterations specified have not been fully performed'
  );
});
