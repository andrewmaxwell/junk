const ops = {
  '-': {prec: 1, func: (a, b) => a - b, inst: 'SU'},
  '+': {prec: 1, func: (a, b) => a + b, inst: 'AD'},
  '*': {prec: 2, func: (a, b) => a * b, inst: 'MU'},
  '/': {prec: 2, func: (a, b) => a / b, inst: 'DI'},
};

const buildAst = (tokens, args) => {
  if (tokens.length < 2) {
    const [n] = tokens;
    return args.includes(n) ? {op: 'arg', n: args.indexOf(n)} : {op: 'imm', n};
  }
  let opIndex;
  let level = 0;
  tokens.forEach((t, i) => {
    if (t === '(') level++;
    else if (t === ')') level--;
    else if (
      !level &&
      (!opIndex || (ops[t] && ops[t].prec <= ops[tokens[opIndex]].prec))
    ) {
      opIndex = i;
    }
  });
  if (!opIndex && tokens[0] === '(') return buildAst(tokens.slice(1, -1), args);
  return {
    op: tokens[opIndex],
    a: buildAst(tokens.slice(0, opIndex), args),
    b: buildAst(tokens.slice(opIndex + 1), args),
  };
};

const parse = (program) => {
  const tokens = program
    .replace(/\s*([-+*/()[\]]|[A-Za-z]+|[0-9]+)\s*/g, ':$1')
    .substring(1)
    .split(':')
    .map((tok) => (isNaN(tok) ? tok : tok | 0));
  return buildAst(
    tokens.slice(tokens.indexOf(']') + 1),
    tokens.slice(1, tokens.indexOf(']'))
  );
};

const simplify = (ast) => {
  if (!ast.a) return ast;
  const a = simplify(ast.a);
  const b = simplify(ast.b);
  if (a.op !== 'imm' || b.op !== 'imm') return {...ast, a, b};
  return {op: 'imm', n: ops[ast.op].func(a.n, b.n)};
};

const toAsm = ({op, n, a, b}) =>
  op === 'imm'
    ? ['IM ' + n]
    : op === 'arg'
    ? ['AR ' + n]
    : [
        ...toAsm(a),
        'PU',
        ...toAsm(b),
        'SW',
        'PO',
        {'+': 'AD', '-': 'SU', '*': 'MU', '/': 'DI'}[op],
      ];

function Compiler() {
  this.pass1 = parse;
  this.pass2 = simplify;
  this.pass3 = toAsm;
}
// TESTS

const {Test} = require('./test');
var prog = '[ x y z ] ( 2*3*x + 5*y - 3*z ) / (1 + 3 + 2*2)';

var c = new Compiler();

var p1 = c.pass1(prog);
// console.log(JSON.stringify(p1, null, 2));
Test.assertEquals(
  p1,
  {
    op: '/',
    a: {
      op: '-',
      a: {
        op: '+',
        a: {
          op: '*',
          a: {op: '*', a: {op: 'imm', n: 2}, b: {op: 'imm', n: 3}},
          b: {op: 'arg', n: 0},
        },
        b: {op: '*', a: {op: 'imm', n: 5}, b: {op: 'arg', n: 1}},
      },
      b: {op: '*', a: {op: 'imm', n: 3}, b: {op: 'arg', n: 2}},
    },
    b: {
      op: '+',
      a: {op: '+', a: {op: 'imm', n: 1}, b: {op: 'imm', n: 3}},
      b: {op: '*', a: {op: 'imm', n: 2}, b: {op: 'imm', n: 2}},
    },
  },
  'pass1'
);

var p2 = c.pass2(p1);
Test.assertEquals(
  p2,
  {
    op: '/',
    a: {
      op: '-',
      a: {
        op: '+',
        a: {op: '*', a: {op: 'imm', n: 6}, b: {op: 'arg', n: 0}},
        b: {op: '*', a: {op: 'imm', n: 5}, b: {op: 'arg', n: 1}},
      },
      b: {op: '*', a: {op: 'imm', n: 3}, b: {op: 'arg', n: 2}},
    },
    b: {op: 'imm', n: 8},
  },
  'pass2'
);

function simulate(asm, args) {
  var r0 = undefined;
  var r1 = undefined;
  var stack = [];
  asm.forEach(function (instruct) {
    var match = instruct.match(/(IM|AR)\s+(\d+)/) || [0, instruct, 0];
    var ins = match[1];
    var n = match[2] | 0;

    if (ins == 'IM') {
      r0 = n;
    } else if (ins == 'AR') {
      r0 = args[n];
    } else if (ins == 'SW') {
      var tmp = r0;
      r0 = r1;
      r1 = tmp;
    } else if (ins == 'PU') {
      stack.push(r0);
    } else if (ins == 'PO') {
      r0 = stack.pop();
    } else if (ins == 'AD') {
      r0 += r1;
    } else if (ins == 'SU') {
      r0 -= r1;
    } else if (ins == 'MU') {
      r0 *= r1;
    } else if (ins == 'DI') {
      r0 /= r1;
    }
  });
  return r0;
}

var p3 = c.pass3(p2);
Test.assertEquals(simulate(p3, [4, 0, 0]), 3, 'prog(4,0,0) == 3');
Test.assertEquals(simulate(p3, [4, 8, 0]), 8, 'prog(4,8,0) == 8');
Test.assertEquals(simulate(p3, [4, 8, 16]), 2, 'prog(4,8,6) == 2');

// (() => {
//   const input = '[ x y z ] x - y - z + 10 / 5 / 2 - 7 / 1 / 7';
//   const p1 = c.pass1(input);
//   const p2 = c.pass2(p1);
//   const p3 = c.pass3(p2);
// })();
