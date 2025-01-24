/*

egg: 1 day
larva: 4 days
pupa: 5 days
non reproducing adult: 2 days
reproducing adult: 40 days
eggs over life time: 700


2 adults: 
lay 700 eggs
wait 10 days
700 young adults, 2 10 day old adults


1 female
lay 350 female eggs
wait 10 days
350 young females, 1 10 day old female
lay 122,850 female eggs
wait 10 days
122,850 young females, 350 10 day old females, 1 20 day old female




*/

const eggsPerCycle = 50n;
const maxAge = 7;

const nextGeneration = (gen) => {
  const next = {0: 0n};
  next[0] = 0n;
  for (const age in gen) {
    next[0] += gen[age] * eggsPerCycle;
    if (+age < maxAge) next[+age + 1] = gen[age];
  }
  return next;
};

import {Test} from './test.js';
Test.assertDeepEquals(nextGeneration({0: 1n}), {1: 1n, 0: eggsPerCycle});
Test.assertDeepEquals(nextGeneration({1: 1n, 0: eggsPerCycle}), {
  2: 1n,
  1: eggsPerCycle,
  0: eggsPerCycle * (eggsPerCycle + 1n),
});
Test.assertDeepEquals(nextGeneration({[maxAge]: 10n}), {0: 10n * eggsPerCycle});

const size = (g) => Object.values(g).reduce((a, b) => a + b, 0n);
const target = 3.8e11; // whale
// const target = 1.1944e31; // earth
// const target = 3e59; // universe

let g = {0: 1n};
for (let i = 1; i < 100; i++) {
  g = nextGeneration(g);
  const s = size(g);
  console.log(i, s.toString());
  if (s > target) break;
}
