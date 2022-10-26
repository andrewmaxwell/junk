const numIsInteresting = (n, phrases) => {
  const str = n.toString();
  if (str.length < 3) return false;
  if (/^\d0+$/.test(str)) return true;
  if (/^(\d)\1+$/.test(str)) return true;
  if ('1234567890'.includes(str)) return true;
  if ('9876543210'.includes(str)) return true;
  if (str === [...str].reverse().join('')) return true;
  if (phrases.includes(n)) return true;
  return false;
};

const isInteresting = (number, awesomePhrases) => {
  console.log(number, awesomePhrases);
  if (numIsInteresting(number, awesomePhrases)) return 2;
  if (
    numIsInteresting(number + 1, awesomePhrases) ||
    numIsInteresting(number + 2, awesomePhrases)
  )
    return 1;
  return 0;
};

import {Test} from './test.js';
Test.assertEquals(isInteresting(3, [1337, 256]), 0);
Test.assertEquals(isInteresting(1336, [1337, 256]), 1);
Test.assertEquals(isInteresting(1337, [1337, 256]), 2);
Test.assertEquals(isInteresting(11208, [1337, 256]), 0);
Test.assertEquals(isInteresting(11209, [1337, 256]), 1);
Test.assertEquals(isInteresting(11211, [1337, 256]), 2);
