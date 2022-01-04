const {RSUProgram} = require('./rsu');
const {Test} = require('./test');

Test.assertDeepEquals(
  new RSUProgram(
    'p0FFLFFR((FFFR)2(FFFFFL)3)4qp1FRqp2FP1qp3FP2qp4FP3qP0P1P2P3P4'
  ).getTokens(),
  [
    'p0',
    'F',
    'F',
    'L',
    'F',
    'F',
    'R',
    '(',
    '(',
    'F',
    'F',
    'F',
    'R',
    ')2',
    '(',
    'F',
    'F',
    'F',
    'F',
    'F',
    'L',
    ')3',
    ')4',
    'q',
    'p1',
    'F',
    'R',
    'q',
    'p2',
    'F',
    'P1',
    'q',
    'p3',
    'F',
    'P2',
    'q',
    'p4',
    'F',
    'P3',
    'q',
    'P0',
    'P1',
    'P2',
    'P3',
    'P4',
  ]
);

// RSU Official Specs - Whitespace and Indentation Support - Example 1
Test.assertDeepEquals(
  new RSUProgram(`p0
    (
      F2 L
    )2 (
      F2 R
    )2
  q
  
  (
    P0
  )2`).getTokens(),
  ['p0', '(', 'F2', 'L', ')2', '(', 'F2', 'R', ')2', 'q', '(', 'P0', ')2']
);
// RSU Official Specs - Comment Support - Code Example
Test.assertDeepEquals(
  new RSUProgram(`/*
    RoboScript Ultimatum (RSU)
    A simple and comprehensive code example
  */
  
  // Define a new pattern with identifier n = 0
  p0
    // The commands below causes the MyRobot to move
    // in a short snake-like path upwards if executed
    (
      F2 L // Go forwards two steps and then turn left
    )2 (
      F2 R // Go forwards two steps and then turn right
    )2
  q
  
  // Execute the snake-like pattern twice to generate
  // a longer snake-like pattern
  (
    P0
  )2`).getTokens(),
  ['p0', '(', 'F2', 'L', ')2', '(', 'F2', 'R', ')2', 'q', '(', 'P0', ')2']
);
// RSU Official Specs - Pattern Scoping - Example 1
Test.assertDeepEquals(
  new RSUProgram(`// The global scope can "see" P1 and P2
  p1
    // P1 can see P2, P3 and P4
    p3
      // P3 can see P1, P2 and P4 though invoking
      // P1 will likely result in infinite recursion
      F L
    q
    p4
      // Similar rules apply to P4 as they do in P3
      F P3
    q
  
    F P4
  q
  p2
    // P2 can "see" P1 and therefore can invoke P1 if it wishes
    F3 R
  q
  
  (
    P1 P2
  )2 // Execute both globally defined patterns twice`).getTokens(),
  [
    'p1',
    'p3',
    'F',
    'L',
    'q',
    'p4',
    'F',
    'P3',
    'q',
    'F',
    'P4',
    'q',
    'p2',
    'F3',
    'R',
    'q',
    '(',
    'P1',
    'P2',
    ')2',
  ]
);
// RSU Official Specs - Pattern Scoping - Example 2
Test.assertDeepEquals(
  new RSUProgram(`p1
    p1
      F R
    q
  
    F2 P1 // Refers to "inner" (locally defined) P1 so no infinite recursion results
  q
  
  (
    F2 P1 // Refers to "outer" (global) P1 since the
    // global scope can't "see" local P1
  )4
  
  /*
    Equivalent to executing the following raw commands:
    F F F F F R F F F F F R F F F F F R F F F F F R
  */`).getTokens(),
  ['p1', 'p1', 'F', 'R', 'q', 'F2', 'P1', 'q', '(', 'F2', 'P1', ')4']
);

// RSU Official Specs - Whitespace and Indentation Support - Example 2
Test.expectError(
  'Your tokenizer should throw an error whenever there is whitespace before numbers (stray numbers)',
  function () {
    new RSUProgram(`p 0
    (
      F 2L
    ) 2 (
      F 2 R
    )         2
  q
  
  (
    P  0
  )2`).getTokens();
  }
);
// RSU Official Specs - Finally ... - Mini Code Example 1
Test.expectError(
  'Your tokenizer should throw an error when there are "stray comments"',
  function () {
    new RSUProgram(
      `this is a stray comment not escaped by a double slash or slash followed by asterisk F F F L F F F R F F F L F F F R and lowercase "flr" are not acceptable as commands`
    ).getTokens();
  }
);
// RSU Official Specs - Finally ... - Mini Code Example 2
Test.expectError(
  'Your tokenizer should throw an error in the presence of "stray numbers"',
  function () {
    new RSUProgram(`F 32R 298984`).getTokens();
  }
);

const p = new RSUProgram('p0F4q(P0L)3');
Test.assertDeepEquals(
  p.convertToRaw(p.getTokens()),
  'FFFFLFFFFLFFFFL'.split('')
);

// Description Example in Converter section
var r = new RSUProgram(
  'p0FFLFFR((FFFR)2(FFFFFL)3)4qp1FRqp2FP1qp3FP2qp4FP3qP0P1P2P3P4'
);
Test.assertDeepEquals(
  r.convertToRaw(r.getTokens()).join(''),
  'FFLFFRFFFRFFFRFFFFFLFFFFFLFFFFFLFFFRFFFRFFFFFLFFFFFLFFFFFLFFFRFFFRFFFFFLFFFFFLFFFFFLFFFRFFFRFFFFFLFFFFFLFFFFFLFRFFRFFFRFFFFR'
);
// Description Example in Converter section - Pattern Invocation before Definition
r = new RSUProgram(
  'P0P1P2P3P4p0FFLFFR((FFFR)2(FFFFFL)3)4qp1FRqp2FP1qp3FP2qp4FP3q'
);
Test.assertDeepEquals(
  r.convertToRaw(r.getTokens()).join(''),
  'FFLFFRFFFRFFFRFFFFFLFFFFFLFFFFFLFFFRFFFRFFFFFLFFFFFLFFFFFLFFFRFFFRFFFFFLFFFFFLFFFFFLFFFRFFFRFFFFFLFFFFFLFFFFFLFRFFRFFFRFFFFR'
);

// A few more examples based on Description code snippets
r = new RSUProgram(`p0
    (
      F2 L
    )2 (
      F2 R
    )2
  q

  (
    P0
  )2`);
Test.assertDeepEquals(r.convertToRaw(r.getTokens()), [
  'F',
  'F',
  'L',
  'F',
  'F',
  'L',
  'F',
  'F',
  'R',
  'F',
  'F',
  'R',
  'F',
  'F',
  'L',
  'F',
  'F',
  'L',
  'F',
  'F',
  'R',
  'F',
  'F',
  'R',
]);
r = new RSUProgram(`// The global scope can "see" P1 and P2
  p1
    // P1 can see P2, P3 and P4
    p3
      // P3 can see P1, P2 and P4 though invoking
      // P1 will likely result in infinite recursion
      F L
    q
    p4
      // Similar rules apply to P4 as they do in P3
      F P3
    q

    F P4
  q
  p2
    // P2 can "see" P1 and therefore can invoke P1 if it wishes
    F3 R
  q

  (
    P1 P2
  )2 // Execute both globally defined patterns twice`);
Test.assertDeepEquals(r.convertToRaw(r.getTokens()), [
  'F',
  'F',
  'F',
  'L',
  'F',
  'F',
  'F',
  'R',
  'F',
  'F',
  'F',
  'L',
  'F',
  'F',
  'F',
  'R',
]);
r = new RSUProgram(`p1
    p1
      F R
    q

    F2 P1 // Refers to "inner" (locally defined) P1 so no infinite recursion results
  q

  (
    F2 P1 // Refers to "outer" (global) P1 since the
    // global scope can't "see" local P1
  )4

  /*
    Equivalent to executing the following raw commands:
    F F F F F R F F F F F R F F F F F R F F F F F R
  */`);
Test.assertDeepEquals(r.convertToRaw(r.getTokens()), [
  'F',
  'F',
  'F',
  'F',
  'F',
  'R',
  'F',
  'F',
  'F',
  'F',
  'F',
  'R',
  'F',
  'F',
  'F',
  'F',
  'F',
  'R',
  'F',
  'F',
  'F',
  'F',
  'F',
  'R',
]);

var program = new RSUProgram(`/*
    RoboScript Ultimatum (RSU)
    A simple and comprehensive code example
  */

  // Define a new pattern with identifier n = 0
  p0
    // The commands below causes the MyRobot to move
    // in a short snake-like path upwards if executed
    (
      F2 L // Go forwards two steps and then turn left
    )2 (
      F2 R // Go forwards two steps and then turn right
    )2
  q

  // Execute the snake-like pattern twice to generate
  // a longer snake-like pattern
  (
    P0
  )2`);
Test.assertDeepEquals(
  program.executeRaw(program.convertToRaw(program.getTokens())),
  '*  \r\n*  \r\n***\r\n  *\r\n***\r\n*  \r\n***\r\n  *\r\n***'
);

Test.assertDeepEquals(
  new RSUProgram(`/*
    RoboScript Ultimatum (RSU)
    A simple and comprehensive code example
  */

  // Define a new pattern with identifier n = 0
  p0
    // The commands below causes the MyRobot to move
    // in a short snake-like path upwards if executed
    (
      F2 L // Go forwards two steps and then turn left
    )2 (
      F2 R // Go forwards two steps and then turn right
    )2
  q

  // Execute the snake-like pattern twice to generate
  // a longer snake-like pattern
  (
    P0
  )2`).execute(),
  '*  \r\n*  \r\n***\r\n  *\r\n***\r\n*  \r\n***\r\n  *\r\n***'
);

Test.expectError('should throw an error', () =>
  new RSUProgram(`p03
  (
    F4 L
  )4
q

P03`).getTokens()
);

Test.expectError('should throw', () =>
  new RSUProgram(`p
(
  F4 L
)4
q

P3`).getTokens()
);

Test.expectError('should throw', () =>
  new RSUProgram(
    `p3
    (
      F4 L
    )4
    q
    
    P`
  ).getTokens()
);

r = new RSUProgram(`p0
(
  F2 R F4 L
q
)5

P0`);
Test.expectError('should throw', () => r.convertToRaw(r.getTokens()));

r = new RSUProgram(`p1
(
  P0

  p0
    F2 R F4 L
  q
)13
q`);
Test.expectError('should throw', () => r.convertToRaw(r.getTokens()));

r = new RSUProgram(`p772037
p519169
  L7 R5 R F12 L19 L F6 R F R
q
p928633
  R7 F F F19 R R7 R1 F L14 F
q
p234215
  L2 R17 F8 R16 L R R4 F R L9
q
p736306
  F R16 F1 F8 F R15 F L L11 L
q

L18 R11 P519169 R3 F R (
  L4 R10 L L2 R3 L2 F F R2 R7
) P928633 L P234215
q

F P772037 L R15 R P772037 L9 R (
F L7 L12 (
  L R14 R L5 F1 L4 L11 F11 R6 R
)13 F17 L4 F L15 F R
)0 F8`);

Test.assertDeepEquals(
  r.convertToRaw(r.getTokens()).join(''),
  'FLLLLLLLLLLLLLLLLLLRRRRRRRRRRRLLLLLLLRRRRRRFFFFFFFFFFFFLLLLLLLLLLLLLLLLLLLLFFFFFFRFRRRRFRLLLLRRRRRRRRRRLLLRRRLLFFRRRRRRRRRRRRRRRRFFFFFFFFFFFFFFFFFFFFFRRRRRRRRRFLLLLLLLLLLLLLLFLLLRRRRRRRRRRRRRRRRRFFFFFFFFRRRRRRRRRRRRRRRRLRRRRRFRLLLLLLLLLLRRRRRRRRRRRRRRRRLLLLLLLLLLLLLLLLLLRRRRRRRRRRRLLLLLLLRRRRRRFFFFFFFFFFFFLLLLLLLLLLLLLLLLLLLLFFFFFFRFRRRRFRLLLLRRRRRRRRRRLLLRRRLLFFRRRRRRRRRRRRRRRRFFFFFFFFFFFFFFFFFFFFFRRRRRRRRRFLLLLLLLLLLLLLLFLLLRRRRRRRRRRRRRRRRRFFFFFFFFRRRRRRRRRRRRRRRRLRRRRRFRLLLLLLLLLLLLLLLLLLRFFFFFFFF'
);
