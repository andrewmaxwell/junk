const parse = (tokens) => {
  const stack = [];
  const scope = {main: []};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t[0] === 'p') {
      if (stack.some((s) => s.id === undefined)) {
        throw new Error(`Can't define patterns inside parentheses.`);
      }
      stack.push({id: t.slice(1), index: i + 1});
    } else if (t === 'q') {
      const {id, index} = stack.pop();
      if (id === undefined) {
        throw new Error('Mismatched parentheses!');
      }
      if (!stack.length) {
        // nested patterns do not go in this scope
        scope[id] = parse(tokens.slice(index, i));
      }
    } else if (stack.some((s) => s.id)) {
      // don't execute pattern definitions
      continue;
    } else if (t === '(') {
      stack.push(scope.main.length);
    } else if (t[0] === ')') {
      const index = stack.pop();
      if (isNaN(index)) {
        throw new Error('Mismatched parentheses!');
      }
      const vals = scope.main.splice(index, Infinity);
      for (let j = 0; j < (t.slice(1) || 1); j++) {
        scope.main.push(...vals);
      }
    } else if (t[0] === 'P') {
      scope.main.push(t);
    } else {
      scope.main.push(...t[0].repeat(t.slice(1) || 1).split(''));
    }
  }
  if (stack.length) {
    throw new Error('Expected ) or q');
  }
  return scope;
};

const doConversion = (scope) => {
  let result = '';
  for (const t of scope.main) {
    if (t[0] === 'P') {
      if (!scope[t.slice(1)]) {
        throw new Error(`Unknown pattern: ${t}`);
      }
      result += doConversion({...scope, ...scope[t.slice(1)]});
    } else {
      result += t;
    }
  }
  return result;
};

class RSUProgram {
  constructor(source) {
    this.source = source;
  }
  getTokens() {
    const withoutComments = this.source
      .replace(/\/\/.*|\/\*(.|\n)*\*\//g, ' ')
      .trim();
    if (/[^\d]0\d/.test(withoutComments)) {
      throw new Error(`Leading zeros are not allowed.`);
    }
    if (!/^(F\d*|R\d*|L\d*|p\d+|q|P\d+|\)\d*|\(|\s)*$/.test(withoutComments)) {
      throw new Error('Invalid syntax');
    }
    return withoutComments.match(/F\d*|R\d*|L\d*|p\d+|q|P\d+|\)\d*|\(/g);
  }
  convertToRaw(tokens) {
    return doConversion(parse(tokens)).split('');
  }
  executeRaw(cmds) {
    const dirs = [
      {x: 1, y: 0},
      {x: 0, y: 1},
      {x: -1, y: 0},
      {x: 0, y: -1},
    ];

    const path = [{x: 0, y: 0}];
    let dir = 0;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    for (const letter of cmds) {
      if (letter === 'F') {
        const p = path[path.length - 1];
        const x = p.x + dirs[dir].x;
        const y = p.y + dirs[dir].y;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        path.push({x, y});
      } else if (letter === 'L') dir = (dir + 3) % 4;
      else if (letter === 'R') dir = (dir + 1) % 4;
    }

    const grid = new Array(maxY - minY + 1)
      .fill()
      .map(() => new Array(maxX - minX + 1).fill(' '));
    for (const {x, y} of path) grid[y - minY][x - minX] = '*';
    return grid.map((r) => r.join('')).join('\r\n');
  }
  execute() {
    return this.executeRaw(this.convertToRaw(this.getTokens()));
  }
}

module.exports = {RSUProgram};
