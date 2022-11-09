const trunc = (str, len = 20) => {
  str = str.replace(/\n/g, '\\n');
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
};

class Parser {
  constructor(grammar) {
    this.grammar = grammar;
    this.debug = true;
  }
  recursiveParse(str, type) {
    const g = this.grammar[type];

    if (!g) {
      if (this.debug) console.log('literal', type, str);
      return str.startsWith(type)
        ? {type: '', value: type, length: String(type).length}
        : {error: `Expected "${type}" at "${trunc(str)}"`};
    }

    if (g instanceof RegExp) {
      if (this.debug) console.log('regex', type, str);
      const m = str.match(g);
      return m
        ? {type, value: m[1] || m[0], length: m[0].length}
        : {error: `Expected ${type} at "${trunc(str)}"`};
    }

    if (g.any) {
      if (this.debug) console.log('any', type, str);
      const errors = [];
      for (const el of g.any) {
        const value = this.recursiveParse(str, el);
        if (value.error) errors.push(value.error);
        else return value;
      }
      return {error: errors.join('\nOR\n')};
    }

    if (g.concat) {
      if (this.debug) console.log('concat', type, str);
      const result = [];
      let length = 0;
      for (const el of g.concat) {
        const optional = el[el.length - 1] === '?';
        const value = this.recursiveParse(
          str.slice(length),
          optional ? el.slice(0, -1) : el
        );
        if (!value.error) {
          result.push(value);
          length += value.length;
        } else if (!optional) return value;
      }
      return {type, value: result, length};
    }
  }
  parse(str) {
    return this.recursiveParse(str, 'main');
  }
}

export const parse = (input, grammar) => new Parser(grammar).parse(input);
