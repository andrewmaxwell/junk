export const isMatch = (nfa, str) => {
  const queue = [{state: 0, index: 0}];
  for (const {state, index} of queue) {
    for (const {match, from, to} of nfa) {
      if (state !== from || (match && str[index] !== match)) continue;
      if (to === 'end' && index + match.length === str.length) return true;
      queue.push({state: to, index: index + match.length});
    }
  }
  return false;
};

const _isMatchRec = (nfa, [curr, ...rest]) =>
  !!curr &&
  ((curr.state === 'end' && !curr.str) ||
    _isMatchRec(nfa, [
      ...rest,
      ...nfa
        .filter((n) => curr.state === n.from && curr.str.startsWith(n.match))
        .map((n) => ({state: n.to, str: curr.str.slice(n.match.length)})),
    ]));

export const isMatch2 = (nfa, str) => _isMatchRec(nfa, [{state: 0, str}]);
