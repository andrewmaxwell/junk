const turingMachine = (transitionTable) => {
  const tape = {};
  let headPosition = 0;
  let state = 'A';
  let steps = 0;
  while (state !== 'HALT') {
    const transitionKey = state + ',' + (tape[headPosition] ?? 0);
    const transition = transitionTable[transitionKey];
    if (!transition) {
      console.log('No transition found.');
      break;
    }
    tape[headPosition] = transition.newSymbol;
    headPosition += transition.moveDirection;
    state = transition.newState;
    steps++;
  }

  console.log(`Machine halted after ${steps} steps.`);
};

turingMachine({
  'A,0': {newSymbol: 1, moveDirection: 1, newState: 'B'},
  'A,1': {newSymbol: 1, moveDirection: -1, newState: 'B'},
  'B,0': {newSymbol: 1, moveDirection: -1, newState: 'A'},
  'B,1': {newSymbol: 1, moveDirection: 1, newState: 'HALT'},
});
