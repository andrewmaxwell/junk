// The lessons, in chapters, from small to big. Each has a title, the expression, and what to notice.
export const chapters = [
  {
    title: 'How eating works',
    lessons: [
      {
        title: 'An alligator eats',
        src: '(λx.x)(λy.y)',
        goal: 'There’s only one rule: a hungry alligator eats whatever is just to its right. Then it dies, and its eggs hatch into copies of what it ate. Its open mouth shows it’s hungry, the dashed outline is what it’s about to eat, and the jiggling eggs are the ones that will hatch.',
      },
      {
        title: 'Two eggs, two copies',
        src: '(λx.xx)(λy.y)',
        goal: 'An alligator with two eggs of its color makes two copies of its meal.',
      },
      {
        title: 'Eat two things, keep the first',
        src: '(λxy.x)(λa.a)(λb.b)',
        goal: 'Two alligators stacked up eat two things in a row. Only the top one has an egg, so the first meal makes it to the end and the second is thrown away.',
      },
      {
        title: 'An egg with no alligator',
        src: '(λxy.yx)y',
        goal: 'An egg that doesn’t belong to any alligator is gray and shows its name. It stands for anything, like x in algebra. Watch it move under the brown alligator and stay gray: it still doesn’t belong to it.',
      },
      {
        title: 'Old alligators',
        src: 'x((λy.y)z)',
        goal: 'A gray old alligator keeps a group together, like parentheses. It never eats anything. Once the group it guards is down to one thing, it isn’t needed anymore, so it leaves.',
      },
    ],
  },
  {
    // eggs with no alligator stand in for anything, like x and y in algebra
    title: 'What the names do',
    lessons: [
      {
        title: 'TRUE picks the first',
        src: 'TRUE x y',
        goal: 'Names like TRUE are shorthand for alligator families. TRUE eats two things and keeps the first: all “true” needs to do is choose. Press “Why is it built like that?” to see where its alligators come from.',
      },
      {
        title: 'FALSE picks the second',
        src: 'FALSE x y',
        goal: 'FALSE is the other way to choose: it keeps the second thing.',
      },
      {
        title: 'NOT swaps the choice',
        src: 'NOT TRUE x y',
        goal: 'NOT hands its true or false the two options in the other order, so TRUE ends up choosing y.',
      },
      {
        title: 'A number means “do this n times”',
        src: '3 f x',
        goal: 'The number 3 is an alligator family that does f three times. Watch it turn f and x into f(f(f x)).',
      },
      {
        title: 'Adding',
        src: 'ADD 2 3 f x',
        goal: 'To add, do f 3 times, then 2 more times on top.',
      },
      {
        title: 'Multiplying',
        src: 'MUL 2 3 f x',
        goal: 'To multiply, repeat “do f 3 times”, 2 times.',
      },
      {
        title: 'A PAIR holds two things',
        src: 'FST (PAIR x y)',
        goal: 'A pair holds onto two things and hands them to whatever it eats. FST hands it TRUE, which picks the first.',
      },
    ],
  },
  {
    title: 'Computing with names',
    lessons: [
      {
        title: 'true AND false',
        src: 'AND TRUE FALSE',
        goal: 'Real logic now: AND only says true if both of its inputs are true, so this comes out as FALSE.',
      },
      {
        title: 'true AND false, all opened up',
        src: '(λab.aba)(λab.a)(λab.b)',
        goal: 'The same thing with every name opened up from the start: AND, TRUE, and FALSE are just alligators. The answer is FALSE’s alligators: two stacked up, with the egg belonging to the bottom one.',
      },
      {
        title: 'NOT (NOT TRUE)',
        src: 'NOT (NOT TRUE)',
        goal: 'Two NOTs cancel out.',
      },
      {
        title: '2 + 3',
        src: 'ADD 2 3',
        goal: 'Arithmetic out of nothing but alligators. The answer is the alligator family for 5.',
      },
      {
        title: '2 × 3',
        src: 'MUL 2 3',
        goal: 'The answer is the alligator family for 6.',
      },
      {
        title: 'Naming things yourself',
        src: 'TWICE = λfx.f(fx)\nTWICE NOT TRUE',
        goal: 'You can give any alligator family a name. TWICE eats f and x and does f to x two times, so TWICE NOT TRUE is NOT (NOT TRUE), which is TRUE again. Notice that TWICE is exactly the same alligators as the number 2: a number just means doing something that many times.',
      },
      {
        title: '3 − 1',
        src: 'SUB 3 1',
        goal: 'Subtracting is harder, since a number can only repeat things forward. It counts down with PRED, which rebuilds a number one step behind. Don’t worry about following every step of PRED: watch for the answer.',
      },
      {
        title: '2³',
        src: 'POW 2 3',
        goal: 'Powers: chain three copies of 2 together.',
      },
    ],
  },
  {
    title: 'Going further',
    lessons: [
      {
        title: 'A meal that never ends',
        src: '(λx.xx)(λx.xx)',
        goal: 'This one eats a copy of itself and turns right back into itself, forever. In 1936, Church and Turing each proved that no mechanical procedure can always tell whether a computation will ever finish. For programs, that’s called the halting problem.',
      },
      {
        title: 'Skipping a meal that never ends',
        src: 'TRUE x ((λx.xx)(λx.xx))',
        goal: 'That never-ending meal is back, as TRUE’s second choice. TRUE throws its second thing away, and since the leftmost alligator always eats first, nobody ever starts on the never-ending meal.',
      },
      {
        title: '2 factorial, with recursion',
        src: 'FACT = Y (λfn.ISZERO n 1 (MUL n (f (PRED n))))\nFACT 2',
        goal: 'The big one: 2 × 1, computed by a function that calls itself, with recursion built out of nothing by Y. It takes about 170 steps, so try “Fast forward”.',
      },
    ],
  },
];

// all the lessons in order, each with its number (from 1) and chapter
export const lessons = chapters
  .flatMap((chapter) => chapter.lessons)
  .map((lesson, i) => ({
    ...lesson,
    number: i + 1,
    chapter: chapters.find((c) => c.lessons.includes(lesson)),
  }));
