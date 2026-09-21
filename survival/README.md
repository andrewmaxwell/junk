Survival of the Fittest - 2025 - Each agent has a neural network which decides
how to move using info about its surroundings. The ones that find food survive
and reproduce.

Agents start with random weights. A brain never changes during an agent's life;
the only way the population improves is that better foragers eat more, reach
energy 1, and reproduce with mutation, while worse ones hit energy 0 and die.

- `node benchmark.js` scores a brain in isolation (fixed food field, no death or
  reproduction). The live sim can't tell you whether brains are improving, since
  food intake there is capped by the spawn rate rather than by skill.
- `getPretrainedNetwork.js` is not used by the sim. It supervises a net on
  "turn toward the food" and is kept only as a reference point for the
  benchmark - it's what a brain that genuinely uses its senses looks like.

Note on measuring: `benchmark.js` scatters food uniformly, which rewards
reactive sweeping only. In the live sim (where food grows in clumps) it gets
the ranking backwards - brains with memory scored 106 there vs 140 without,
yet sustained 27% more population in the sim. Sustained population is the
honest measure; the benchmark is for catching gross decay.
