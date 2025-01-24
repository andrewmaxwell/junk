const quicksort = (arr) =>
  arr.length
    ? [
        ...quicksort(arr.slice(1).filter((el) => el <= arr[0])),
        arr[0],
        ...quicksort(arr.filter((el) => el > arr[0])),
      ]
    : arr;

/*

(defun concat (a b)
  (cond 
    (a (cons (car a) (concat (cdr a) b)))
    (1 b)))

(defun filter (pred arr)
  (cond (arr 
    (cond ((pred (car arr)) (cons (car arr) (filter pred (cdr arr))))
      (1 (filter pred (cdr arr)))))
    (1 arr)))

(defun getLeft (arr pivot)
  (filter 
    (lambda (x) (<= x pivot)) 
    (cdr arr)))

(defun getRight (arr pivot)
  (filter 
    (lambda (x) (> x pivot)) 
    (cdr arr)))

(defun quicksort (arr)
  (cond
    (arr
      (concat
        (quicksort (getLeft arr (car arr)))
        (cons (car arr) (quicksort (getRight arr (car arr))))))
    (1 '())))

(quicksort '(5 4 5 5 2 3 6 7 8 8 1 4 2 0))

*/

import {Test} from './test.js';

const arr = [8, 4, 1, 2, 3, 4, 5, 6, 5, 4, 4, 3, 2, 6, 7, 8, 9, 0, 1, 1, 0];
Test.assertDeepEquals(
  quicksort(arr),
  arr.sort((a, b) => a - b)
);
Test.assertDeepEquals(quicksort([]), []);
