/*

Mockingbird = λf.ff

T = λab.a
F = λab.b
DEC = λnfx.n(λgh.h(gf))(λu.x)(λu.u)

*/

export const tests = [
  [
    'λa.a',
    'λa.a',
    'The simplest lambda is the <b>identity</b>. It is equivalent to <code>(a) => a;</code> in JavaScript. The "a" before the "." is the argument, and the "a" after the dot is what gets returned.',
  ],
  [
    'λx.x',
    'λa.a',
    "Renaming variables makes no difference. It's the same lambda.",
  ],
  [
    '(λx.x)(z)',
    'z',
    'Applying the identity to a value returns the same value.',
  ],
  ['(λx.x)z', 'z', 'Parentheses are often optional.'],
  ['(λx.x)(λx.x)', 'λa.a', 'You can apply lambdas to other lambdas, too.'],
  [
    '(λab.a)xy',
    'x',
    'Lambdas can take more than one argument. This one takes two arguments and returns the first. "x" is bound to the "a" argument and "y" is bound to the "b" argument.',
  ],
  [
    '(λab.a)x',
    'λb.x',
    'Lambdas can be partially applied. This is the same lambda as above but with only one argument given. It returns a lambda that takes the second argument and returns the first.',
  ],
  //   [
  //     `ID = λx.x\nID ID`,
  //     'λa.a',
  //     "For convenience, we can assign names to lambdas. (This is not part of lambda calculus, it's just very convenient.)",
  //   ],
  //   [
  //     `ADD = λmnfx.mf(nfx)
  // TWO = λfx.f(fx)
  // THREE = λfx.f(f(fx))
  // ADD TWO THREE`,
  //     'λab.a(a(a(a(ab))))',
  //   ],
  //   [
  //     `INC = λnfx.f(nfx)
  // THREE = λfx.f(f(fx))
  // INC THREE`,
  //     'λab.a(a(a(ab)))',
  //   ],
  //   [
  //     `MULT = λnkf.n(kf)
  // TWO = λfx.f(fx)
  // THREE = λfx.f(f(fx))
  // MULT TWO THREE`,
  //     'λab.a(a(a(a(a(ab)))))',
  //   ],
  //   [
  //     `POW = λnk.k(n)
  // TWO = λfx.f(fx)
  // THREE = λfx.f(f(fx))
  // POW TWO THREE`,
  //     'λab.a(a(a(a(a(a(a(ab)))))))',
  //   ],
  //   [
  //     `DEC = λnfx.n(λgh.h(gf))(λu.x)(λu.u)
  // THREE = λfx.f(f(fx))
  // DEC THREE`,
  //     'λab.a(ab)',
  //   ],
];
