class Counter {
  constructor() {
    this.count = 0;
  }
  next() {
    return ++this.count;
  }
}

export function toNFA(ast, start = 0, end = 'end', counter = new Counter()) {
  switch (ast.type) {
    case 'literal':
      return [{match: ast.value, from: start, to: end}];
    case 'sequence': {
      let currentState = start;
      return ast.value.flatMap((node, index) => {
        const nextState = index === ast.value.length - 1 ? end : counter.next();
        const arr = toNFA(node, currentState, nextState, counter);
        currentState = nextState;
        return arr;
      });
    }
    case '|':
      return ast.value.flatMap((node) => toNFA(node, start, end, counter));
    case '+': {
      const s = counter.next();
      return [
        ...toNFA(ast.value, start, s, counter),
        ...toNFA(ast.value, s, s, counter),
        {match: '', from: s, to: end},
      ];
    }
    case '*': {
      const s = counter.next();
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
