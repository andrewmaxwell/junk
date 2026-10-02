Lambdagator - 2026 - Watch lambda calculus run, drawn as hungry alligators eating each other.

It's organized as 23 short lessons in four chapters, shown as a path across the top, each with a sentence on what to notice. Finished lessons get checked off, and when one ends, Next goes on to the next. To try your own expression, open "Write your own" (`\` or `λ` for lambda, single-letter variables, `λab.x` is short for `λa.λb.x`).

It's drawn as Bret Victor's [Alligator Eggs](http://worrydream.com/AlligatorEggs/): each lambda is a hungry alligator guarding its family, each variable is an egg the color of the alligator it belongs to, and old gray alligators group things like parentheses. An alligator eats whatever is to its right, then dies, and each of its eggs hatches into a copy of what it ate.

Nothing moves until you press Next. Before each step, the hungry alligator opens its mouth and the caption says what will happen; Next plays it: the meal shrinks into the mouth, then flies out to each of its eggs, growing back to full size as the eggs crack open and the alligator dies. "⏩ Fast forward" plays the rest quickly (or all of it again, if it's finished), speeding up through the middle of long runs and slowing down at the end. Underneath, the expression is written in the usual notation, colored to match the alligators, with the part about to change underlined.

Reduction is normal order (leftmost, outermost first), so it finds a normal form whenever one exists. Between steps, click any hungry alligator with something to its right to have it eat next instead. Variables get renamed to avoid capture, but that isn't animated, since the colors already tell the alligators apart.

Uppercase names like `TRUE`, `ADD`, and `Y` are built in, numbers are Church numerals, and you can define your own on separate lines (`TWICE = λfx.f(fx)`). Nothing is hidden behind the names: under each lesson's goal is every definition it depends on, built up from plain lambdas (factorial lists Y, TRUE, FALSE, ISZERO, MUL, PRED, the numbers, and FACT itself). Names show up as chips with a faint drawing of their alligators inside, and unfold only when they're applied, with a caption explaining what they mean. When part of the expression turns back into exactly something with a name, like the recursion in the factorial example becoming `FACT` again, it's folded back into a chip so big expressions stay readable. The final result is recognized if it matches a name or number.

To see why names like `TRUE = λab.a` and `MUL = λmnf.m(nf)` are defined the way they are, each one has a "Why?" that works backward from what it needs to do to the lambda that does it, with a "Try it" button. The "What the names do" examples show each one in action on eggs with no alligator, which stand in for anything, like x and y in algebra: `3 f x` hatches into `f(f(f x))`.

The "What is this?" dialog explains what lambda calculus is and why it matters, illustrates the rules, and says how the alligators map to the usual notation.

Files:

- `lambda.js`: parsing, reduction steps, and writing terms out
- `gatorLayout.js`: where each alligator and egg goes
- `stage.js`: draws layouts and animates between them
- `animate.js`: the animation for each kind of step
- `captions.js`: what the captions say
- `names.js`: what each built-in name means and why it's built that way
- `examples.js`: the lessons
- `help.js`: the "What is this?" and "Why?" dialogs, and the list of built-in names
- `main.js`: the controls and stepping through
- `test/lambda.test.js`: tests for `lambda.js`. Run them with `node --test lambdagator/test/*.test.js`

The older text-based interpreter is in `../lambdaCalculus`.
