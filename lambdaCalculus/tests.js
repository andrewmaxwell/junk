/*


I = λa.a // Identity
M = λf.ff // Mockingbird, self-application
K = λab.a // Kestrel, Const, Always, always returns the first thing, church true
K I = λab.b // Kite, always returns second one, church false
C = λabc.acb // Cardinal, flips b and c arguments, church not
DEC = λnfx.n(λgh.h(gf))(λu.x)(λu.u)

C K == K I (cardinal is basically not, if you think of K being true and KI being false)
C (K I) = K
*/

export const tests = [
  [
    'The simplest lambda is the <b>identity</b>. It is equivalent to <code>(a) => a;</code> in JavaScript: a function that takes one argument and immediately returns it.',
    'λa.a',
    'λa.a',
  ],
  [
    "Renaming arguments makes no difference. It's the same lambda.",
    'λx.x',
    'λa.a',
  ],
  [
    'Applying the identity to an argument returns the argument.',
    '(λx.x)(z)',
    'z',
  ],
  ['Parentheses are often optional.', '(λx.x)z', 'z'],
  ['You can apply lambdas to other lambdas, too.', '(λx.x)(λx.x)', 'λa.a'],
  [
    'Lambdas can take more than one argument. This one takes two arguments and returns the first. "x" is bound to the "a" argument and "y" is bound to the "b" argument.',
    '(λab.a)xy',
    'x',
  ],
  [
    'Lambdas can be partially applied. This is the same lambda as above but with only one argument given. It returns a lambda that takes the second argument and returns the first.',
    '(λab.a)x',
    'λa.x',
  ],
  [
    'A lambda that immediately returns a lambda is the same as a lambda with the arguments of the two combined.',
    'λa.λb.a',
    'λab.a',
  ],
  [
    "Just for fun, lets string several together. Remember, renaming the arguments doesn't change anything as long as they're in the same places.",
    'λm.λnp.λxyz.mzy(xmn)p',
    'λabcdef.afe(dab)c',
  ],
  [
    'So how is this useful? Maybe we need some values. Lets start with booleans. Here is how we\'ll represent "true": a lambda that takes two arguments and returns the first. Think of it like a ternary expression: when the predicate is true, you return the first value.',
    'λab.a',
    'λab.a',
  ],
  [
    'Similarly, when the predicate in a boolean expression is false, we take the second value. So we can represent "false" as a function that takes two arguments and always returns the second.',
    'λab.b',
    'λab.b',
  ],
  [
    'To negate a boolean, we can apply <code>λabc.acb</code>, which is called the C-combinator or Cardinal. The C-combinator takes a three arguments and applies them, reversing the arguments of the last two. Since booleans are functions that take two arguments and return one, this effectively switches which boolean they are.',
    '(λabc.acb)(λab.a)',
    'λab.b',
  ],
  [
    "For convenience, lets assign names to these. This isn't part of lambda calculus, it's just convenient.",
    `TRUE = λab.a
FALSE = λab.b
NOT = λabc.acb

NOT FALSE`,
    'TRUE',
  ],
  [
    'For AND, we can use this lambda: <code>λab.aba</code>. It takes two boolean arguments and if the first is true, it returns the second. If it the first is false, it returns the first.  Go ahead and change the FALSE in the last line to TRUE and verify that the output is what you would expect.',
    `TRUE = λab.a
FALSE = λab.b
AND = λab.aba

AND TRUE FALSE`,
    'FALSE',
  ],
  [
    'OR is similar, but if the first argument is true, it returns the first argument, otherwise it returns the second argument.',
    `TRUE = λab.a
FALSE = λab.b
OR = λab.aab

OR FALSE TRUE`,
    'TRUE',
  ],
  [
    "Interestingly, <code>λa.aa</code> behaves the same as <code>λab.aab</code>. It's also known as the M-combinator or Mockingbird. Can you figure out why they behave the same?",
    `TRUE = λab.a
FALSE = λab.b
M = λa.aa

M FALSE TRUE`,
    'TRUE',
  ],
  [
    'You can do boolean equality with <code>λab.ab(NOT b)</code>. It takes two "boolean" arguments (and remember, booleans in lambda calculus are functions that take two arguments and either return their first or second argument). Then if the first is true, it returns the second. If the first is false, it returns NOT the second.',
    `TRUE = λab.a
FALSE = λab.b
NOT = λabc.acb
EQ = λab.ab(NOT b)

EQ FALSE FALSE
`,
    'TRUE',
  ],
  [
    'If you wanted to, you could write <code>λab.ab(NOT b)</code> as <code>λab.ab(λcd.bdc)</code>',
    `TRUE = λab.a
FALSE = λab.b
EQ = λab.ab(λcd.bdc)

EQ FALSE TRUE
`,
    'FALSE',
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
