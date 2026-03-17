/**
 * @template State
 * @param {{
 *   startState: State,
 *   stateToString: (state: State) => string,
 *   getNeighbors: (state: State) => Iterable<State>,
 * }} params
 * @returns {{iterate: () => void, queue: State[], seen: Set<string>}}
 */

export const makeBFS = ({startState, stateToString, getNeighbors}) => {
  const queue = [startState];
  const seen = new Set();
  seen.add(stateToString(startState));

  const iterate = () => {
    const current = queue.shift(); // BFS
    if (!current) return;

    for (const n of getNeighbors(current)) {
      const key = stateToString(n);
      if (!seen.has(key)) {
        queue.push(n);
        seen.add(key);
      }
    }
  };

  return {iterate, queue, seen};
};
