const car = (arr) => arr[0];
const cdr = (arr) => arr.slice(1);
const cons = (el, arr) => [el, ...arr];

const startsWith = (long, short) =>
  !short || (car(long) === car(short) && startsWith(cdr(long), cdr(short)));

const trimLeft = (long, short) =>
  !short ? long : trimLeft(cdr(long), cdr(short));

const reverse = (arr, result) =>
  arr.length ? reverse(cdr(arr), cons(car(arr), result)) : result;

const splitReverse = (str, delimiter, result) =>
  !str.length
    ? result
    : startsWith(str, delimiter)
    ? splitReverse(trimLeft(str, delimiter), delimiter, cons('', result))
    : splitReverse(
        cdr(str),
        delimiter,
        cons(car(result) + car(str), cdr(result))
      );

const split = (str, delimiter) =>
  reverse(splitReverse(str, delimiter, ['']), []);

/*

# const startsWith = (long, short) =>
#   !short || (car(long) === car(short) && startsWith(cdr(long), cdr(short)));

# const trimLeft = (long, short) =>
#   !short ? long : trimLeft(cdr(long), cdr(short));

# const reverse = (arr, result) =>
#   arr.length ? reverse(cdr(arr), cons(car(arr), result)) : result;



# const split = (str, delimiter) =>
#   reverse(splitReverse(str, delimiter, ['']), []);



(defun not (x)
  (cond (x '()) ('t 't)))

(defun startsWith (long short)
  (cond
    ((not short) 't)
    (
      (eq (car long) (car short))
      (startsWith (cdr long) (cdr short))
    )
    ('t '())
  )
)

(defun trimLeft (long short)
  (cond
    ((not short) long)
    ('t (trimLeft (cdr long) (cdr short)))
  )
)

(defun reverse (arr result)
  (cond
    (arr (reverse (cdr arr) (cons (car arr) result)))
    ('t result)
  )
)

(defun splitReverse (str delimiter result)
  (cond
    ((not str) result)
    (
      (startsWith str delimiter)
      (splitReverse (trimLeft str delimiter) delimiter (cons "" result))
    )
    ('t 
      (splitReverse 
        (cdr str) 
        delimiter 
        (cons (+ (car result) (car str)) (cdr result))
      )
    )
  )
)

(defun split (str delimiter)
  (reverse (splitReverse str delimiter (list "")) '())
)

*/

import {Test} from './test.js';

Test.assertDeepEquals(split('abcd,ef,ghijk,l', ','), [
  'abcd',
  'ef',
  'ghijk',
  'l',
]);

Test.assertDeepEquals(split('a!!b!!c', '!!'), ['a', 'b', 'c']);
Test.assertDeepEquals(split('aaa', 'a'), ['', '', '', '']);
Test.assertDeepEquals(split('aaa', 'aa'), ['', 'a']);
// Test.assertDeepEquals(split('abc', ''), ['a', 'b', 'c']);
