const search = ({startState, endState, getNextStates, toHash}) => {
  // This object maps from state hashes to the state that first led to them. If X led to Y, then Y: 'X' would be added to this.
  const hashToPrevState = {};

  // Add the start state to prev and set its value to null, because nothing led to it.
  hashToPrevState[toHash(startState)] = null;

  // a list of states to examine. They'll be examined from beginning to end, which makes it a breadth-first search.
  const q = [startState];

  // go through the q in order (it will get longer as more states are discovered and added)
  for (let current of q) {
    // to compare states, we have to compare their hashes. If we've reached the end state, return the path from the beginning to the end state.
    if (toHash(current) === toHash(endState)) {
      // build a path from the end back to the start using hashToPrevState
      const result = [];
      while (current !== startState) {
        result.push(current);
        current = hashToPrevState[toHash(current)];
      }
      return result.reverse();
    }

    // iterate through the next possible states
    for (const next of getNextStates(current)) {
      const hash = toHash(next);

      // if we've seen this state before, skip it
      if (hash in hashToPrevState) continue;

      // otherwise, add it to the queue
      q.push(next);

      // and record that the "current" state led to this state
      hashToPrevState[hash] = current;
    }
  }

  return 'No solution!';
};

const stateKeys = ['maggie', 'poison', 'dog', 'homer'];

const result = search({
  // states can be any shape or data structure
  startState: {homer: 0, maggie: 0, dog: 0, poison: 0}, // 0 means they haven't crossed
  endState: {homer: 1, maggie: 1, dog: 1, poison: 1}, // 1 means they have crossed

  // must take a state and return an array of possible, valid next states
  getNextStates: (state) =>
    // generate states for each thing crossing or returning
    stateKeys
      .flatMap((key) => [
        // if homer and thing are both false, they can cross
        !state.homer &&
          !state[key] && {...state, [key]: 1, homer: 1, name: key + ' across'},

        // if homer and thing are both true, they can return
        state.homer &&
          state[key] && {...state, [key]: 0, homer: 0, name: key + ' returns'},
      ])
      // remove invalid states
      .filter(
        (state) =>
          state && // remove falsy ones
          !(state.maggie === state.dog && state.dog !== state.homer) && // can't have maggie and dog together without homer
          !(state.maggie === state.poison && state.poison !== state.homer) // can't have maggie and poison together without homer
      ),

  // must return a consistent string given a state
  // state hashes are used to easily compare states and use them as keys in a dictionary
  toHash: (state) => stateKeys.map((p) => state[p]).join(','),
});

console.log(result);
