/* eslint-disable no-use-before-define */
const inspect = (x) =>
  require('util').inspect(x, {depth: Infinity, color: true});

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
      if (!stack) throw new Error('Unexpected ): ' + tokens.slice(i).join(' '));
    } else {
      stack[stack.length - 1].push(s);
    }
  }
  if (stack.length !== 1)
    throw new Error('Expected ): ' + JSON.stringify(stack));
  return stack[0];
};
const parse = (str) => nest(str.match(/\(|\)|"[^"]*"|[^\s()]+/g, str))[0];

const input = `

(let isPrime?
   (fn (list x) (none 
                  (fn (list z) (= z 0))
                  (map
                    (fn (list y) (mod x y))
                    (range 2 (inc (int (Math/sqrt x)))))))

 (let nPrimes
     (fn (list n) (take
                    n
                    (filter isPrime? (iterate inc 2))))

   (nPrimes 20)))
`;

const clean = (str) => str.replace(/[^a-z0-9$_]/gi, '');
const indent = (str) => str.replace(/\n/g, '\n  ');
const funcs = {
  let: (name, val, body) =>
    indent(`(()=>{\nlet ${clean(name)} = ${toJS(val)};\nreturn ${toJS(body)}`) +
    `\n})()`,
  fn: (args, body) => `(${args.slice(1).join(', ')}) => ${toJS(body)}`,
  'Math/sqrt': (a) => `Math.sqrt(${toJS(a)})`,
  '=': (a, b) => `${toJS(a)} === ${toJS(b)}`,
};

const toJS = (ast) => {
  if (Array.isArray(ast)) {
    const [func, ...args] = ast;
    if (funcs[func]) return funcs[func](...args);
    return `${func}(${args.map(toJS).join(', ')})`;
  }
  return clean(ast);
};

const stdLib = `
const map = (func, data) => data.map(func);
const filter = (func, data) => data.filter(func);
const any = (func, data) => data.some(func);
const all = (func, data) => data.every(func);
const none = (func, data) => !data.some(func);
const mod = (a, b) => a % b;
const range = (start, end) => {
  const result = [];
  for (let i = start; i < end; i++) result.push(i);
  return result;
};
const inc = (v) => v + 1;
const int = (v) => v | 0;
const take = (n, arr) => arr.slice(0, n);
const not = (v) => !v;
const iterate = (action, start) => {
  const result = [];
  for (let i = start; result.length < 1000; i = action(i)) result.push(i);
  return result;
};
`;

const parsed = parse(input);
const js = toJS(parsed);
console.log('parsed', inspect(parsed));
console.log(js);
console.log(eval(stdLib + js));
