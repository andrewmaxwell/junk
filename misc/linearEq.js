const gcd = (a, b) => (a && b ? gcd(b, a % b) : a || b);

const reduceMatrix = (matrix) => {
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i][i] !== 1) {
      if (i === matrix.length - 1) {
        for (let k = 0; k < matrix[i].length; k++) {
          matrix[i][k] /= matrix[i][i];
        }
      } else {
        // if a different row has a 1, swap it
        // otherwise mult and add a lower row to this row (make sure it does not have a 0 in this column)
      }
    }
    for (let j = 0; j < matrix.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < matrix[j].length; k++) {
        matrix[j][k] -= matrix[j][k] * matrix[i][k];
      }
    }
  }
};

const solve = (equations) => new Map();

import {Test, describe, it} from './test.js';
describe('testBasicSingleEquation', function () {
  it('2x=4', function () {
    Test.assertApproxEquals(solve(['2x=4']).get('x'), 2.0);
  });
});

describe('testBasicTwoEquations', function () {
  it('2x+8y=4, -x+4y=14', function () {
    let result = solve(['2x+8y=4', '-x+4y=14']);
    Test.assertApproxEquals(result.get('x'), -6);
    Test.assertApproxEquals(result.get('y'), 2);
  });
});

// describe('testBasicSolvableRepeated', function () {
//   it('x=4y, 2x=8y, x+y=5', function () {
//     let result = solve(['x=4y', '2x=8y', 'x+y=5']);
//     Test.assertApproxEquals(result.get('x'), 4);
//     Test.assertApproxEquals(result.get('y'), 1);
//   });
// });

// describe('testBasicZeroAsSolution', function () {
//   it('x+y=7z-1, 6x+z=-3y, 4y+10z=-8x', function () {
//     let result = solve(['x+y=7z-1', '6x+z=-3y', '4y+10z=-8x']);
//     Test.assertApproxEquals(result.get('x'), 1);
//     Test.assertApproxEquals(result.get('y'), -2);
//   });
// });

// describe('testBasicLongVariables', function () {
//   it('2alpha+8beta=4, -alpha+4beta=14', function () {
//     let result = solve(['2alpha+8beta=4', '-alpha+4beta=14']);
//     Test.assertApproxEquals(result.get('alpha'), -6);
//     Test.assertApproxEquals(result.get('beta'), 2);
//   });
// });

// describe('testBasicRightHandVariables', function () {
//   it('2x=8y, x+y=5', function () {
//     let result = solve(['2x=8y', 'x+y=5']);
//     Test.assertApproxEquals(result.get('x'), 4);
//     Test.assertApproxEquals(result.get('y'), 1);
//   });
// });

// describe('testBasicRepeatingVariables', function () {
//   it('2x-y+3x=-2y+3x+9y, -y+x+2y=5', function () {
//     let result = solve(['2x-y+3x=-2y+3x+9y', '-y+x+2y=5']);
//     Test.assertApproxEquals(result.get('x'), 4);
//     Test.assertApproxEquals(result.get('y'), 1);
//   });
// });

// describe('testBasicNotEnoughEqs', function () {
//   it('x+y=0', function () {
//     Test.assertApproxEquals(solve(['x+y=0']), null);
//   });
// });

// describe('testBasicNoSolutions', function () {
//   it('x+2y=1, 2x=2-4y', function () {
//     Test.assertApproxEquals(solve(['x+2y=1', '2x=2-4y']), null);
//   });
// });

// describe('testBasicIndeterminate', function () {
//   it('x+y=1, 2x+2y=2', function () {
//     Test.assertApproxEquals(solve(['x+y=1', '2x+2y=2']), null);
//   });
// });

// x+y=7z-1
// 6x+z=-3y
// 4y+10z=-8x

// 1 1 -7 -1
// 6 3  1  0  -= 6A
// 4 2  5  0  -= 4A

// 1 1  -7 -1
// 0 -3 43  6  *= -1
// 0 -2 33  4

// 1 1  -7 -1
// 0 3 -43 -6  += C
// 0 -2 33  4

// 1 1  -7 -1  -= B
// 0 1 -10 -2
// 0 -2 33  4  += 2B

// 1 0   3  1
// 0 1 -10 -2
// 0 0  13  0  /= 13

// 1 0   3  1  -= 3C
// 0 1 -10 -2  += 10C
// 0 0   1  0

// 1 0 0  1  -= 3C
// 0 1 0 -2  += 10C
// 0 0 1  0

// x = 1
// y = -2
// z = 0
