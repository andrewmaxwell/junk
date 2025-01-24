const toSoundex = (str) =>
  str
    .toLowerCase()
    .replace(/[wh]/g, '')
    .replace(/[bfpv]/g, 1)
    .replace(/[cgjkqsxz]/g, 2)
    .replace(/[dt]/g, 3)
    .replace(/l/g, 4)
    .replace(/[mn]/g, 5)
    .replace(/r/g, 6)
    .replace(/(.)\1+/g, '$1')
    .replace(/(?!^)[aeiouy]/g, '')
    .replace(/^\d/, str[0]);
// .slice(0, 4)
// .padEnd(4, 0)
// .toUpperCase();

const soundex = (names) => names.split(' ').map(toSoundex).join(' ');

import {Test} from './test.js';
// Test.assertEquals(soundex('Sarah Connor'), 'S600 C560');
// Test.assertEquals(soundex('Sara Conar'), 'S600 C560');
// Test.assertEquals(soundex('Serah Coner'), 'S600 C560');
// Test.assertEquals(soundex('Sarh Connor'), 'S600 C560');
// Test.assertEquals(soundex('Sayra Cunnarr'), 'S600 C560');
// Test.assertDeepEquals(soundex('Ashcraft'), 'A261');
Test.assertDeepEquals(soundex('hpwqyouxqfjrjnpsiivr'), 'H122');
