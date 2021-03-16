const rom = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
];

const toRoman = (num) => {
  for (const [letters, val] of rom)
    if (val <= num) return letters + toRoman(num - val);

  return '';
};

const fromRoman = (str) => {
  if (!str) return 0;
  for (const [letters, val] of rom)
    if (str.startsWith(letters))
      return val + fromRoman(str.slice(letters.length));
};

const RomanNumerals = {toRoman, fromRoman};

const {Test} = require('./test');
Test.assertEquals(RomanNumerals.toRoman(1000), 'M');
Test.assertEquals(RomanNumerals.toRoman(999), 'CMXCIX');
Test.assertEquals(RomanNumerals.toRoman(4), 'IV');
Test.assertEquals(RomanNumerals.toRoman(1), 'I');
Test.assertEquals(RomanNumerals.toRoman(1991), 'MCMXCI');
Test.assertEquals(RomanNumerals.toRoman(2006), 'MMVI');
Test.assertEquals(RomanNumerals.toRoman(2020), 'MMXX');

Test.assertEquals(RomanNumerals.fromRoman('XXI'), 21);
Test.assertEquals(RomanNumerals.fromRoman('I'), 1);
Test.assertEquals(RomanNumerals.fromRoman('III'), 3);
Test.assertEquals(RomanNumerals.fromRoman('IV'), 4);
Test.assertEquals(RomanNumerals.fromRoman('MMVII'), 2007);
Test.assertEquals(RomanNumerals.fromRoman('MDCLXIX'), 1669);
