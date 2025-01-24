const find = (long, short) =>
  [...long].map((_, i) => +long.slice(i).startsWith(short));

console.log(find('abcabcabcabcccccabcabcaaaabc', 'abc'));

/*

(defun not (x) (cond (x 0) (1 1)))

(defun startsWith (long short)
  (cond
    ((not short) 1)
    ((eq (car long) (car short))
      (startsWith (cdr long) (cdr short)))
    (1 0)))

(defun find (long short) 
  (cond
    (long 
      (cons 
        (startsWith long short)
        (find (cdr long) short)))
    (1 "")))

(find 'abcabcabcabcccccabcabcaaaabc 'abc)

*/
