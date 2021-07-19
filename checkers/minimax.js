export const minimax = (getNextStates) =>
  function func(
    node,
    depth = 5,
    isMaximizing = true,
    a = -Infinity,
    b = Infinity
  ) {
    if (!depth) return node.score;
    if (isMaximizing) {
      let value = -Infinity;
      for (const child of getNextStates(node)) {
        value = Math.max(value, func(child, depth - 1, false, a, b));
        a = Math.max(a, value);
        if (a >= b) break;
      }
      return value;
    } else {
      let value = Infinity;
      for (const child of getNextStates(node)) {
        value = Math.min(value, func(child, depth - 1, true, a, b));
        b = Math.min(b, value);
        if (b <= a) break;
      }
      return value;
    }
  };
