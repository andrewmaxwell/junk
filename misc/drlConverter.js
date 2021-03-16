const data = {
  type: 'matchAny',
  conditions: [
    {
      type: 'matchAll',
      conditions: [
        {
          type: 'condition',
          field: 'CAT-CLAIM-DATA',
          operation: '==',
          value: '4930',
        },
        {
          type: 'condition',
          field: 'DATA-FOR-SNAILS',
          operation: 'in',
          value: '450, 900, 1800',
        },
        {
          type: 'condition',
          field: 'DOG-MEDS',
          operation: '>',
          value: '965',
        },
      ],
    },
    {
      type: 'condition',
      field: 'FLOWER-POWER',
      operation: '<=',
      value: '9001',
    },
    {
      type: 'condition',
      field: 'FLOWER-POWER',
      operation: '<=',
      value: '9001',
    },
  ],
};

const drlGenerator = (() => {
  const generate = (data) => {
    switch (data.type) {
      case 'matchAny':
        return `(${data.conditions.map(generate).join(' || ')})`;
      case 'matchAll':
        return `(${data.conditions.map(generate).join(', ')})`;
      case 'condition':
        return `(${data.field}) ${data.operation} ${
          data.value.includes(',') ? `(${data.value})` : data.value
        }`;
      default:
        return `<Invalid thing: ${JSON.stringify(data)}>`;
    }
  };
  return (data) => `get${generate(data)}`;
})();

const drlToJSON = (() => {
  const nest = (tokens) => {
    const stack = [[]];
    for (let i = 0; i < tokens.length; i++) {
      const s = tokens[i];
      if (s === '(') {
        const n = [];
        stack[stack.length - 1].push(n);
        stack.push(n);
      } else if (s === ')') {
        stack.pop();
        if (!stack.length)
          throw new Error('Unexpected ): ' + tokens.slice(i).join(' '));
      } else {
        stack[stack.length - 1].push(s);
      }
    }
    if (stack.length !== 1)
      throw new Error('Expected ): ' + JSON.stringify(stack));
    return stack[0];
  };

  const arrSplit = (arr, val) => {
    const result = [[]];
    for (let el of arr) {
      if (el === val) result.push([]);
      else result[result.length - 1].push(el);
    }
    return result;
  };

  const parse = (tokens) => {
    if (!Array.isArray(tokens)) return tokens;
    if (tokens.length === 1) return parse(tokens[0]);
    if (tokens.includes('||'))
      return {type: 'matchAny', conditions: arrSplit(tokens, '||').map(parse)};
    if (tokens.every((t) => t === ',' || !isNaN(t))) return tokens.join('');
    if (tokens.includes(','))
      return {type: 'matchAll', conditions: arrSplit(tokens, ',').map(parse)};
    for (let operation of ['==', '>=', '<=', '>', '<', '!=', 'in']) {
      if (tokens.includes(operation)) {
        const [field, value] = arrSplit(tokens, operation).map(parse);
        return {field, operation, value};
      }
    }
    return `<Could not parse: ${JSON.stringify(tokens)}>`;
  };
  return (str) =>
    parse(nest(str.match(/>=|<=|\|\||[()<>,]|==|[\w-]+/g).slice(1)));
})();

// OUTPUT
// window.output.innerText = drlGenerator(data);

console.log(drlGenerator(data));
const result = drlToJSON(drlGenerator(data));
console.log(JSON.stringify(result, null, 2));
