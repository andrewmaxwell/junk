/*


I = λa.a // Identity
M = λf.ff // Mockingbird, self-application
K = λab.a // Kestrel, Const, Always, always returns the first thing, church true
K I = λab.b // Kite, always returns second one, church false
C = λabc.acb // Cardinal, flips b and c arguments, church not
DEC = λnfx.n(λgh.h(gf))(λu.x)(λu.u)

C K == K I (cardinal is basically not, if you think of K being true and KI being false)
C (K I) = K
B = λfga.f(ga) // Bluebird, 1-1 Composition
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
    'Lambdas can be partially applied. This is the same lambda as above but with only one argument given. It returns a lambda that takes the second argument and returns the first. Then "b" is renamed to "a" in the result.',
    '(λab.a)x',
    'λa.x',
  ],
  [
    'A lambda that immediately returns a lambda is the same as a lambda with the arguments of the two combined.',
    'λa.λb.a',
    'λab.a',
  ],
  [
    "Just for fun, let's string several together. Remember, renaming the arguments doesn't change anything as long as they're in the same places.",
    'λm.λnp.λxyz.mzy(xmn)p',
    'λabcdef.afe(dab)c',
  ],
  [
    'So how is this useful? Maybe we need some values. Let\'s start with booleans. Here is how we\'ll represent "true": a lambda that takes two arguments and returns the first. Think of it like a ternary expression: when the predicate is true, you return the first value.',
    'λab.a',
    'λab.a',
  ],
  [
    'Similarly, when the predicate in a ternary expression is false, we get the second value. So let\'s represent "false" as a function that takes two arguments and always returns the second.',
    'λab.b',
    'λab.b',
  ],
  [
    `To negate a boolean, we can apply <code>λabc.acb</code>, which is called the C-combinator or Cardinal. The C-combinator takes three arguments and applies them, reversing the order of the last two. Since booleans are functions that take two arguments and return one, this has the effect of switching their value!
      <ol>
        <li>First, to apply <code>λabc.acb</code> to <code>λab.a</code>, take the first argument of the first lambda (<code>a</code>), and replace it with <code>(λab.a)</code> everywhere it exists after the <code>.</code> in the first lambda. Then we remove the first argument. That gives us <code>λbc.(λab.a)cb</code>.</li>
        <li>Next, we apply <code>(λab.a)</code> to <code>cb</code>. So <code>c</code> replaces <code>a</code> and <code>b</code> replaces <code>b</code>, which doesn't really do anything in this case. So doing that simplifies <code>(λab.a)cb</code> to <code>c</code> and we get <code>λbc.c</code>.</li>
        <li>Normalize the variable names for our final answer: <code>λab.b</code>.</li>
      </ol>`,
    '(λabc.acb)(λab.a)',
    'λab.b',
  ],
  [
    "For convenience, let's assign names to these. This isn't part of lambda calculus, it's just convenient. In the example below <code>NOT FALSE</code> just means \"apply <code>NOT</code> to <code>FALSE</code>\"",
    `TRUE = λab.a
FALSE = λab.b
NOT = λabc.acb

NOT FALSE`,
    'TRUE',
  ],
  [
    'For AND, we can use this lambda: <code>λab.aba</code>. It takes two boolean arguments and if the first is true, it returns the second. If the first is false, it returns the first.  Go ahead and change the FALSE in the last line to TRUE and verify that the output is what you would expect.',
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
  [
    'How about numbers? Here are the Church encodings for some numbers. They essentially mean "apply a function to a value this many times".',
    `ONE = λab.ab
TWO = λab.a(ab)
THREE = λab.a(a(ab))
FOUR = λab.a(a(a(ab)))
    `,
    'FOUR',
  ],
  [
    'It would be annoying to have to define them all like this though. We need a lambda to get the successor.',
    `ONE = λab.ab
TWO = λab.a(ab)
SUCC = λabc.b(abc) 

SUCC ONE`,
    'TWO',
  ],
  [
    `Let's do some more!`,
    `ONE = λab.ab
FOUR = λab.a(a(a(ab)))
SUCC = λabc.b(abc)

SUCC (SUCC (SUCC ONE))`,
    'FOUR',
  ],
  [
    "What about zero? Following the same pattern, we need a lambda that applies a lambda to a value zero times. How about <code>λab.b</code>? That's the same as FALSE! That is perfect.",
    `ZERO = λab.b
SUCC = λabc.b(abc)
ONE = SUCC ZERO
TWO = SUCC ONE
THREE = SUCC TWO
FOUR = λab.a(a(a(ab)))

SUCC THREE
`,
    'FOUR',
  ],
  [
    `Writing SUCC multiple times is tiring. We need an addition lambda. How can we apply SUCC X times? By applying a number to SUCC!`,
    `SUCC = λabc.b(abc)
ADD = λab.a SUCC b
ONE = λab.ab
TWO = λab.a(ab)
THREE = λab.a(a(ab))

ADD ONE TWO`,
    'THREE',
  ],
  [
    `How about multiplication? Since numbers are represented by lambdas that apply the first argument to the second some number of times, multiplying them is the same as composing them. <code>λabc.a(bc)</code> is also known as the B-combinator or the Bluebird.`,
    `TWO = λab.a(ab)
THREE = λab.a(a(ab))
SIX = λab.a(a(a(a(a(ab)))))
MULT = λabc.a(bc)

MULT TWO THREE`,
    'SIX',
  ],
  [
    `If you thought the lambda for multiplication was simple, wait until you see the one for exponentiation: <code>λab.ba</code>. This is also known as the T<sub>h</sub>-Combinator or Thrush.`,
    `TWO = λab.a(ab)
THREE = λab.a(a(ab))
EIGHT = λab.a(a(a(a(a(a(a(ab)))))))
POW = λab.ba

POW TWO THREE`,
    'EIGHT',
  ],
  [
    'How about a lambda to tell us if a number is zero? Remember that TRUE is a lambda that always returns its first argument and FALSE and ZERO are the same thing.',
    `TRUE = λab.a
FALSE = λab.b
ISZERO = λa.a(TRUE FALSE)TRUE

ISZERO FALSE`,
    'TRUE',
  ],
  [
    'If you give ISZERO any other number, it will return <code>λab.b</code>.',
    `TRUE = λab.a
FALSE = λab.b
ISZERO = λa.a(TRUE FALSE)TRUE
ONE = λab.ab

ISZERO ONE`,
    'FALSE',
  ],
];
