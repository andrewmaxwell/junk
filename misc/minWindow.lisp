(defun length (arr)
  (cond
    (arr (+ 1 (length (cdr arr))))
    ('t 0)))

(defun not (x)
  (cond (x '()) ('t 't)))

(defun or (x y)
  (cond (x x) (y y) ('t '())))

(defun take (n arr)
  (cond
    ((> n 0) (cons (car arr) (take (- n 1) (cdr arr))))
    ('t '())))

(defun drop (n arr)
  (cond
    ((> n 0) (drop (- n 1) (cdr arr)))
    ('t arr)))

(defun slice (li ri arr) 
  (take (- ri li) (drop li arr)))

(defun getProp (key pairs) 
  (cond
    ((not pairs) 0)
    ((eq key (car (car pairs))) (car (cdr (car pairs))))
    ('t (getProp key (cdr pairs)))
  )
)

(defun getIndex (index arr)
  (cond
    ((> index 0) (getIndex (- index 1) (cdr arr)))
    ('t (car arr))
  )
)

(defun adjustProp (key amt pairs)
  (cond
    ((not pairs) (list (list key amt)))
    (
      (eq key (car (car pairs))) 
      (cons 
        (list key (+ amt (car (cdr (car pairs))))) 
        (cdr pairs)
      )
    )
    ('t (cons (car pairs) (adjustProp key amt (cdr pairs))))
  )
)

(defun getCountsRec (str res)
  (cond
    (str (getCountsRec (cdr str) (adjustProp (car str) 1 res)))
    ('t res)))
(defun getCounts (str) (getCountsRec str '()))

(defun numUniq (str) (length (getCounts str)))

(defun toNum (v) (cond (v 1) ('t 0)))

(defun shrinkLeft (src tCounts wCounts ri li rem result)
  (cond
    (rem (findMinWindow src tCounts wCounts (+ 1 ri) li rem result))
    ('t 
      (shrinkLeft
        src
        tCounts
        (adjustProp (getIndex li src) -1 wCounts)
        ri
        (+ 1 li)
        (+ 
          rem
          (toNum
            (<
              (- 1 (getProp (getIndex li src) wCounts))
              (getProp (getIndex li src) tCounts)
            )
          )
        )
        (cond
          (
            (or
              (not result)
              (< (+ 1 (- ri li)) (length result))
            )
            (slice li (+ 1 ri) src)
          )
          ('t result)
        )
      )
    )
  )
)

(defun findMinWindow (src tCounts wCounts ri li rem result)
  (cond
    ((>= ri (length src)) result)
    ('t 
      (shrinkLeft 
        src 
        tCounts 
        (adjustProp (getIndex ri src) 1 wCounts)
        ri 
        li
        (- 
          rem
          (toNum 
            (eq 
              (+ 1 (getProp (getIndex ri src) wCounts))
              (getProp (getIndex ri src) tCounts)
            )
          )
        )
        result
      )
    )
  )
)

(defun minWindow (src needed)
  (findMinWindow src (getCounts needed) '() 0 0 (numUniq needed) ""))

(minWindow 'xxaxxbxxcxxxxxacxxxbxxxxxx 'abc)