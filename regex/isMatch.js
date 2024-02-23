export const isMatch = (nfa, str) => {
  const nodes = {};
  for (const el of nfa) (nodes[el.from] ||= []).push(el);

  const queue = [{state: 0, index: 0}];
  for (const {state, index} of queue) {
    for (const {match, to} of nodes[state] || []) {
      if (match && str[index] !== match) continue;
      if (to === 'end' && index + match.length === str.length) return true;
      queue.push({state: to, index: index + match.length});
    }
  }
  return false;
};
