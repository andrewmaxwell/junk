export function toNFA(ast, start = 0, end = 'end', counter = {val: 0}) {
  switch (ast.type) {
    case 'literal':
      return [{match: ast.value, from: start, to: end}];
    case 'sequence': {
      return ast.value.reduce(
        ({nfa, currentState}, node, index, arr) => {
          const nextState = index === arr.length - 1 ? end : ++counter.val; // MUTATE
          return {
            nfa: [...nfa, ...toNFA(node, currentState, nextState, counter)],
            currentState: nextState,
          };
        },
        {nfa: [], currentState: start}
      ).nfa;
    }
    case '|':
      return ast.value.flatMap((node) => toNFA(node, start, end, counter));
    case '+': {
      const s = ++counter.val; // MUTATE
      return [
        ...toNFA(ast.value, start, s, counter),
        ...toNFA(ast.value, s, s, counter),
        {match: '', from: s, to: end},
      ];
    }
    case '*': {
      const s = ++counter.val; // MUTATE
      return [
        {match: '', from: start, to: s},
        ...toNFA(ast.value, s, s, counter),
        {match: '', from: s, to: end},
      ];
    }
    case '?':
      return [
        ...toNFA(ast.value, start, end, counter),
        {match: '', from: start, to: end},
      ];
    default:
      throw new Error(`wtf is ${JSON.stringify(ast)}`);
  }
}
