const evaluate = (input) => {
  const lines = input
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.match(/\w+|[=λ()]/g));
  console.log(lines);
};

evaluate(`T = λλ 1
NOT = λλλ 2 0 1 
NOT T`);

// const examples = [
//   {
//     input: `T = λλ 1
// NOT = λλλ 2 0 1
// NOT T`,
//     expected: ['(λλλ 2 0 1) (λλ 1)', 'λλ (λλ 1) 0 1', 'λλ 0'],
//   },
//   //   {
//   //     input: `T = λλ 1
//   // F = λλ 0
//   // SUCC = λλλ 1 (2 1 0)
//   // TWO = λλ 1 (1 0)
//   // FIVE = λλ 1 (1 (1 (1 (1 0))))
//   // PAIR = λλλ 0 2 1
//   // FIRST = λ 0 T
//   // SECOND = λ 0 F
//   // PHI = λ PAIR (SECOND 0) (SUCC (SECOND 0))
//   // PRED = λ FIRST (0 PHI (PAIR F F))
//   // SUB = λλ 0 PRED 1
//   // SUB FIVE TWO`,
//   //     expected: 'λλλ 1 (1 (1 0))',
//   //   },
// ];
