const isFilled = (rows, x, y) => rows[y] && rows[y][x] && rows[y][x] !== ' ';

const getSpot = (rows, x, y, dx, dy) => {
  const result = {x, y, dx, dy, w: ''};
  while (isFilled(rows, x, y)) {
    result.w += rows[y][x];
    if (
      result.cx === undefined &&
      ((dy && (isFilled(rows, x - 1, y) || isFilled(rows, x + 1, y))) ||
        (dx && (isFilled(rows, x, y - 1) || isFilled(rows, x, y + 1))))
    ) {
      result.cx = x;
      result.cy = y;
    }
    x += dx;
    y += dy;
  }
  return result;
};

const wordFits = ({x, y, dx, dy, w}, word, rows) => {
  if (word.length !== w.length) return false;
  for (let i = 0; i < w.length; i++) {
    if (rows[y][x] !== '?' && rows[y][x] !== word[i]) return false;
    x += dx;
    y += dy;
  }
  return true;
};

const fillInWord = ({x, y, dx, dy}, word, rows) => {
  const result = rows.map((r) => [...r]);
  for (let i = 0; i < word.length; i++) {
    result[y][x] = word[i];
    x += dx;
    y += dy;
  }
  return result;
};

const removeWord = (index, words) => {
  const result = [...words];
  result.splice(index, 1);
  return result;
};

// depth first search
const findSolution = (rows, words, [firstSpot, ...otherSpots]) => {
  if (!firstSpot) return rows;
  for (let i = 0; i < words.length; i++) {
    if (!wordFits(firstSpot, words[i], rows)) continue;
    const solution = findSolution(
      fillInWord(firstSpot, words[i], rows),
      removeWord(i, words),
      otherSpots
    );
    if (solution) return solution;
  }
};

const crossWord = (puzzle, words) => {
  const rows = puzzle.split('\n').map((r) => r.split(''));

  const spots = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === ' ') continue;
      if (!isFilled(rows, x - 1, y) && isFilled(rows, x + 1, y)) {
        spots.push(getSpot(rows, x, y, 1, 0));
      }
      if (!isFilled(rows, x, y - 1) && isFilled(rows, x, y + 1)) {
        spots.push(getSpot(rows, x, y, 0, 1));
      }
    }
  }
  spots.sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  return findSolution(rows, words.sort(), spots)
    .map((r) => r.join(''))
    .join('\n');
};

const {Test} = require('./test');
const testPuzzle = (puzzle, words, answer) => {
  Test.assertEquals(crossWord(puzzle, words), answer);
};

let puzzle = `  w     
c???s   
  ? ?   
  d ?   
   c???s
    d   `;
let words = ['cross', 'sword', 'cross', 'word'];
let answer = `  w     
cross   
  r w   
  d o   
   cross
    d   `;

testPuzzle(puzzle, words, answer);

puzzle = `q???t
?    
?    
?    
t???h`;
words = ['quiet', 'tooth', 'quiet'];
answer = `quiet
u    
i    
e    
tooth`;

testPuzzle(puzzle, words, answer);

puzzle = `       h????y
       ?     
       ?     
       ?     
   w????     
   ?   n     
   ?         
   ?         
f??e         `;
words = ['whose', 'hungry', 'whole', 'happen', 'fine'];
answer = `       hungry
       a     
       p     
       p     
   whole     
   h   n     
   o         
   s         
fine         `;

testPuzzle(puzzle, words, answer);

puzzle = `f  m??e
?  ?  ?
?  ?  ?
m??e  ?
      ?
      ?`;
words = ['film', 'make', 'mine', 'more', 'eraser'];
answer = `f  make
i  i  r
l  n  a
more  s
      e
      r`;

testPuzzle(puzzle, words, answer);

(puzzle = `      m????e
      ?     
      ?????e
      ?     
      ?     
k s????r    
? ?         
? ?         
w???r       `),
  (words = ['water', 'middle', 'singer', 'mobile', 'know', 'double', 'shot']),
  (answer = `      mobile
      i     
      double
      d     
      l     
k singer    
n h         
o o         
water       `);
testPuzzle(puzzle, words, answer);

(puzzle = `      m????e
      ?     
      ?????e
      ?     
      ?     
k s????r    
? ?         
? ?         
w???r       `),
  (words = ['water', 'middle', 'singer', 'mobile', 'know', 'double', 'shot']),
  (answer = `      mobile
      i     
      double
      d     
      l     
k singer    
n h         
o o         
water       `);
testPuzzle(puzzle, words, answer);

(puzzle = `         s   b
         ?????
     b   ?   ?
     ?   ?   ?
     ????y   ?
     ?       e
     ?        
  t??e        
  ?           
  ?           
  ?           
t???e         `),
  (words = [
    'sadly',
    'bridge',
    'three',
    'after',
    'beside',
    'sorry',
    'there',
    'take',
  ]),
  (answer = `         s   b
         after
     b   d   i
     e   l   d
     sorry   g
     i       e
     d        
  take        
  h           
  r           
  e           
there         `);
testPuzzle(puzzle, words, answer);

puzzle = `h       
?   h??e
?   ?   
e???t`;

words = ['have', 'hate', 'hot', 'elect'];

answer = `h       
a   hate
v   o   
elect   `;

// testPuzzle(puzzle, words, answer);
