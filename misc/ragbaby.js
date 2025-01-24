const allLetters = [...'abcdefghijklmnopqrstuvwxyz'];
const mod = (a, b) => ((a % b) + b) % b;

const convert = (dir) => (text, key) => {
  const otherLetters = allLetters.filter((t) => !key.includes(t));
  const alpha = [...new Set(key), ...otherLetters];
  console.log(alpha.join(''));
  let index = 0;
  let result = '';
  for (const t of text) {
    if (/[a-z]/i.test(t)) {
      index++;
      const alphaIndex = alpha.indexOf(t.toLowerCase()) + index * dir;
      const letter = alpha[mod(alphaIndex, alpha.length)];
      result += t === t.toLowerCase() ? letter : letter.toUpperCase();
    } else {
      index = 0;
      result += t;
    }
  }
  return result;
};

const encode = convert(1);
const decode = convert(-1);

import {Test} from './test.js';

Test.assertEquals(encode('cipher', 'cipher'), 'ihrbfj');
Test.assertEquals(encode('cipher', 'cccciiiiippphheeeeerrrrr'), 'ihrbfj');
Test.assertEquals(
  encode('This is an example.', 'cipher'),
  'Urew pu bq rzfsbtj.'
);
Test.assertEquals(
  encode('This.tHis.thIs.thiS...', 'cipher'),
  'Urew.uRew.urEw.ureW...'
);

Test.assertEquals(decode('ihrbfj', 'cipher'), 'cipher');
Test.assertEquals(
  decode('Urew pu bq rzfsbtj.', 'cipher'),
  'This is an example.'
);
Test.assertEquals(
  decode('Urew.uRew.urEw.ureW...', 'cipher'),
  'This.tHis.thIs.thiS...'
);

Test.assertEquals(
  encode(decode('This is an example.', 'secretkey'), 'secretkey'),
  'This is an example.'
);
Test.assertEquals(
  decode(encode('This is an example.', 'secretkey'), 'secretkey'),
  'This is an example.'
);

console.log(
  encode(
    "This is a secret message! No go eat some banana pudding. And don't forget to tell your mother you love her!",
    'secretcipher'
  )
);
