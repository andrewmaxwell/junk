const wtf = (a, b, c = {}) =>
  typeof a === 'number' && typeof b === 'number'
    ? Math.max(0, (b ** 2 - a ** 2 + b + a) / 2)
    : Array.isArray(a)
    ? a.reduce((res, el) => res + (Array.isArray(el) ? wtf(el) : el), 0)
    : Array.isArray(b)
    ? b[0]
      ? wtf(a[b[0]], b.slice(1))
      : a
    : typeof a === 'number'
    ? a <= 0
      ? ''
      : a % 15 === 0
      ? 'yinyang'
      : a % 5 === 0
      ? 'yang'
      : a % 3 === 0
      ? 'yin'
      : a
    : typeof a === 'object'
    ? Object.entries(a)
        .map((p) => p.join(' -> '))
        .join('\n')
    : typeof a === 'string'
    ? a.match(/[^ ]+/g)?.length || 0
    : typeof a === 'function'
    ? (x) => (c.hasOwnProperty(x) ? c[x] : (c[x] = a(x)))
    : null;

const summation = wtf;
const sumNested = wtf;
const yinYang = wtf; // The instructions mentioned something about printing everything between 1 and n but the examples below don't show that. So I went with making it match the examples.
const propertyValueAt = wtf; // There is no explanation for the expected output format, so I just made one up?
const printKeyValues = wtf;
const wordCount = wtf;
const memoizationWrapper = wtf;

//-----------------------------------------------------------------------------------------//
// 1. summation
//-----------------------------------------------------------------------------------------//

console.log(summation(4, 10), 49); // should return 49
console.log(summation(10, 4), 0); // should return 0
//-----------------------------------------------------------------------------------------//
// 2. sumNested
//-----------------------------------------------------------------------------------------//

console.log(sumNested([1, 1, 1, [3, 4, [8]], [5]]), 23); // 23
console.log(sumNested([]), 0); //0
//-----------------------------------------------------------------------------------------//
// 3.  yinYang
//-----------------------------------------------------------------------------------------//

/*
The instructions mentioned something about printing everything between 1 and n
but the examples below don't show that. So I went with making it match the
examples.
*/

console.log(yinYang(0), ''); // empty string
console.log(yinYang(3), 'yin'); // "yin"
console.log(yinYang(15), 'yinyang'); // "yinyang"
//-----------------------------------------------------------------------------------------//
// 4. propertyValueAt
//-----------------------------------------------------------------------------------------//

var object = {a: 1, b: {c: 2, d: 3}};
console.log(propertyValueAt(object, ['a']), 1); // returns 1
console.log(propertyValueAt(object, ['b']), {c: 2, d: 3}); // returns { c: 2, d: 3 }
console.log(propertyValueAt(object, ['b', 'd']), 3); // returns 3
console.log(propertyValueAt(object, ['d']), undefined); // returns undefined
console.log(propertyValueAt(object, ['q']), undefined); // returns undefined
//-----------------------------------------------------------------------------------------//
// 5. printKeyValues
//-----------------------------------------------------------------------------------------//

/*
There is no explanation for the expected output format, so I just made one up?
*/

var myObj = {
  key1: 'value1',
  key2: 'value2',
  'key three': 'value3',
};
console.log(printKeyValues(myObj));
//-----------------------------------------------------------------------------------------//
// 6. wordCount
//-----------------------------------------------------------------------------------------//

console.log(wordCount('This is a short sentence!'), 5); // returns 5
console.log(wordCount('ThisIsA!$ReallyLongWord'), 1); // returns 1
console.log(wordCount(' '), 0); // returns 0
//-----------------------------------------------------------------------------------------//
// 7. memoizationWrapper
//-----------------------------------------------------------------------------------------//

var functionToWrap = function (parameter) {
  return parameter * 2;
};
var wrappedFunction = memoizationWrapper(functionToWrap);
console.log(wrappedFunction(1), 2); // returns 2 by calling functionToWrap
console.log(wrappedFunction(1), 2); // returns 2 without calling functionToWrap
