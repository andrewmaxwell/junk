console.clear();

// supports ASCII 0-127 strings of any length

const strToBigInt = ([f, ...r]) =>
  (r.length ? strToBigInt(r) * 128n : 0n) + BigInt(f.charCodeAt(0));

const bigIntToStr = (num) =>
  num ? String.fromCharCode(Number(num % 128n)) + bigIntToStr(num / 128n) : '';

const num = strToBigInt('this is a test string! yay!');
console.log(num);

const str = bigIntToStr(num);
console.log(str);

///// Supports short strings of only capital letters, no need for bigints

const strToInt = ([f, ...r]) =>
  (r.length ? strToInt(r) * 26 : 0) + f.charCodeAt(0) - 65;

const intToStr = (num) =>
  num
    ? String.fromCharCode((num % 26) + 65) + intToStr(Math.floor(num / 26))
    : '';

const num2 = strToInt('FIZZBUZZ');
console.log(num2);

const str2 = intToStr(num2);
console.log(str2);
