// https://www.codewars.com/kata/59f9cad032b8b91e12000035/train/javascript
// https://esolangs.org/wiki/Brainfuck_algorithms#x_.3D_x_.2B_y

// const eq = (a, b) =>
//   a === b ||
//   (a &&
//     typeof a === 'object' &&
//     b &&
//     typeof b === 'object' &&
//     Object.keys({...a, ...b}).every((k) => eq(a[k], b[k])));

const fromSource = (() => {
  const tokens = [
    {type: 'space', regex: /^\s+/, ignore: true},
    {type: 'number', regex: /^-?\d+/, transform: Number},
    {type: 'id', regex: /^\w+/, transform: (s) => s.toLowerCase()},
    {
      type: 'string',
      regex: /^"[^"]+"|'[^']+'/,
      transform: (s) => s.slice(1, -1),
    },
    {type: '[', regex: /^\[/},
    {type: ']', regex: /^]/},
  ];

  const tokenize = (line) => {
    const res = [];
    while (line) {
      const t = tokens.find((t) => t.regex.test(line));
      if (!t) throw new Error(`Bad token! ${line}`);

      const {type, regex, ignore, transform = (f) => f} = t;
      const value = line.match(regex)[0];
      if (!ignore) res.push({type, value: transform(value)});

      line = line.slice(value.length);
    }
    return res;
  };

  const flowOps = ['ifeq', 'ifneq', 'wneq', 'proc'];

  const withFlow = (n) => {
    const stack = [[]];
    for (const t of n) {
      if (flowOps.includes(t.op)) {
        t.body = [];
        stack[stack.length - 1].push(t);
        stack.push(t.body);
      } else if (t.op === 'end') {
        stack.pop();
        if (!stack.length) throw new Error('Unexpected end');
      } else stack[stack.length - 1].push(t);
    }
    return stack.pop();
  };

  return (str) =>
    withFlow(
      str
        .replace(/\/\/.*|--.*|#.*|\s*rem.*/g, '') // remove comments
        .replace(/(\s*\n\s*)+/g, '\n') // remove extraneous whitespace
        .trim()
        .split('\n')
        .map((line) => {
          const tokens = tokenize(line.trim());
          return {op: tokens[0].value, args: tokens.slice(1)};
        })
        .flatMap((line) => {
          const zero = {type: 'number', value: 0};

          // convert strings to numbers
          line.args = line.args.flatMap((a) =>
            a.type === 'string'
              ? a.value
                  .split('')
                  .map((c) => ({type: 'number', value: c.charCodeAt(0)}))
              : a
          );

          const {
            op,
            args: [a, b, c, d],
          } = line;

          if (op === 'add' || op === 'sub' || op === 'mul') {
            const op2 = {add: 'inc', sub: 'dec', mul: '*='}[op];
            // add A B A -> inc A B
            // sub A B A -> dec A B
            // mul A B A -> *= A B
            if (a.type === 'id' && c.type === 'id' && a.value === c.value) {
              return {op: op2, args: [a, b]};
            }

            // add A B B -> inc B A
            // mul A B B -> *= B A
            // sub A B B -> b = a - b -> t=a,t-=b,b=t -> set t 0, inc t a, dec t b, set b 0, inc b t
            if (b.type === 'id' && c.type === 'id' && b.value === c.value) {
              const temp = {type: 'id', value: 'subtemp'};
              return op === 'sub'
                ? [
                    {op: 'set', args: [temp, a]},
                    {op: 'dec', args: [temp, b]},
                    {op: 'set', args: [b, temp]},
                  ]
                : {op: op2, args: [b, a]};
            }

            // add A B C -> set C 0, inc C A, inc C B
            // sub A B C -> set C 0, inc C A, dec C B
            // mul A B C -> set C 0, inc C A, *= C B
            return [
              {op: 'set', args: [c, a]},
              {op: op2, args: [c, b]},
            ];
          }

          // set A B -> set A 0, inc A B
          if (op === 'set' && b.type === 'id') {
            return {op: 'set', args: [a, b]};
          }

          if (op === 'divmod' || op === 'div' || op === 'mod') {
            // # >n d
            // [->[->+>>]>[<<+>>[-<+>]>+>>]<<<<<]
            // >[>>>]>[[-<+>]>+>>]<<<<<
            // # >0 d-n%d n%d n/d
            const ids = 'abcde'
              .split('')
              .map((c) => ({type: 'id', value: 'd' + c}));
            const [da, db, dc, dd] = ids;
            return [
              ...ids.map((id) => ({op: 'set', args: [id, zero]})),
              {op: 'inc', args: [db, b]},
              {op: 'inc', args: [da, a]},
              {op: 'divmod'},
              ...(op === 'divmod' ? [{op: 'set', args: [d, dc]}] : []),
              {op: 'set', args: [c, op === 'mod' ? dc : dd]},
            ];
          }

          return line;
        })
    );
})();

const toBF = (ast) => {
  let result = '';
  let ptr = 0;
  let nextAddress = 0;
  let vars = {};

  const emit = (str) => {
    result += str + '\n';
  };

  const goToVar = (varName, size = 1) => {
    if (!(varName in vars)) {
      vars[varName] = nextAddress;
      nextAddress += size;
    }
    const addr = vars[varName];
    if (addr === ptr) return;
    emit(
      (addr < ptr ? '<'.repeat(ptr - addr) : '>'.repeat(addr - ptr)) +
        ` go to ${varName}`
    );
    ptr = addr;
  };

  const clearVar = (varName) => {
    goToVar(varName);
    emit(`[-] clear ${varName}`);
  };
  const incVar = (varName) => {
    goToVar(varName);
    emit(`+ increment ${varName}`);
  };
  const decVar = (varName) => {
    goToVar(varName);
    emit(`- decrement ${varName}`);
  };
  const whileVar = (varName, func) => {
    goToVar(varName);
    emit(`[ while ${varName}`);
    func();
    decVar(varName);
    emit(`] end while ${varName}`);
  };

  const inc = (target, type, value, negate = false) => {
    if (type === 'number') {
      goToVar(target);
      emit(
        (negate !== value > 0 ? '+' : '-').repeat(Math.abs(value)) +
          ` inc ${target} ${negate ? -value : value}`
      );
    } else if (type === 'id') {
      // t0[-]
      // value[target+t0+value-]
      // t0[value+t0-]
      emit(`\nbegin ${negate ? 'dec' : 'inc'} ${target} ${value}`);
      clearVar('t0');
      whileVar(value, () => {
        goToVar(target);
        emit(negate ? `- decrement ${target}` : `+ increment ${target}`);
        incVar('t0');
      });
      whileVar('t0', () => {
        incVar(value);
      });
      emit(`end ${negate ? 'dec' : 'inc'} ${target}\n`);
    } else {
      throw new Error(`${type} not implemented in inc`);
    }
  };

  const setVar = (target, {type, value}) => {
    if (type === 'number') {
      clearVar(target);
      const v = ((value % 256) + 256) % 256;
      if (v) emit('+'.repeat(v) + ` set ${target} ${v}`);
    } else if (type === 'id') {
      clearVar(target);
      inc(target, type, value);
    } else {
      throw new Error(
        `${type} not implemented in set: ${JSON.stringify({type, value})}`
      );
    }
  };

  for (const {op, args} of ast) {
    switch (op) {
      case 'var': {
        break;
      }
      case 'read': {
        const target = args[0].value;
        // read multiple characters?
        // goToVar(target, dynSize);
        // result += `[>]<[[-]<]> clear ${target}`;
        // result += `,[>,]<[<]> read into ${target}`;
        goToVar(target);
        emit(`, read into ${target}`);
        break;
      }
      case 'msg': {
        args.forEach(({type, value}) => {
          if (type === 'number') {
            clearVar('t0');
            emit('+'.repeat(value) + `.[-] msg "${value}"`);
          } else if (type === 'id') {
            goToVar(value);
            emit(`. msg ${value}`); // ONLY SUPPORTS VARS WITH LENGTH OF 1
          } else {
            throw new Error(`${type} not implemented in msg`);
          }
        });
        break;
      }
      case 'set': {
        const [{value: target}, a] = args;
        setVar(target, a);
        break;
      }
      case 'inc': {
        const [{value: target}, {type, value}] = args;
        inc(target, type, value);
        break;
      }
      case 'dec': {
        const [{value: target}, {type, value}] = args;
        inc(target, type, value, 'negate');
        break;
      }
      case '*=': {
        const [{value: target}, {type, value}] = args;
        if (type === 'id') {
          clearVar('t0');
          clearVar('t1');
          whileVar(target, () => {
            incVar('t1');
          });
          whileVar('t1', () => {
            whileVar(value, () => {
              incVar(target);
              incVar('t0');
            });
            whileVar('t0', () => {
              incVar(value);
            });
          });
        } else {
          throw new Error(`${type} not implemented in *=`);
        }
        break;
      }
      case 'divmod': {
        goToVar('da');
        emit(`[->[->+>>]>[<<+>>[-<+>]>+>>]<<<<<]>[>>>]>[[-<+>]>+>>] divmod`);
        ptr += 5;
        break;
      }
      case 'cmp': {
        // If a < b store -1(255) into c. If a == b store 0 into c. If a > b store 1 into c
        // sign(a - b)
        const [{value: target}, a, b] = args;
        // cz = cx > cy
        // t0[-]t1[-]cz[-]
        // cx[ t0+
        //       cy[- t0[-] t1+ cy]
        //   t0[- cz+ t0]
        //   t1[- cy+ t1]
        //   cy- cx- ]

        clearVar('t0');
        clearVar('t1');
        clearVar('cz');
        setVar('cy', b);
        setVar('cx', a);
        whileVar('cx', () => {
          incVar('t0');
          whileVar('cy', () => {
            clearVar('t0');
            incVar('t1');
          });
          whileVar('t0', () => {
            incVar('cz');
          });
          whileVar('t1', () => {
            incVar('cy');
          });
          decVar('cy');
        });

        goToVar('cz');
        // if cz is 1, then a > b, set target to 1
        break;
      }
      default: {
        console.log(`${op} not implemented`);
      }
    }
  }
  return result;
};

const kcuf = (code, debug) => {
  const ast = fromSource(code);
  if (debug) console.log(JSON.stringify(ast, null, 2));
  return toBF(ast);
};

/// TESTING
const mapping = {
  '>': 'p++;',
  '<': 'p--;',
  '+': 'a[p]++;',
  '-': 'a[p]--;',
  '.': 'o+=String.fromCharCode(a[p]);',
  ',': 'a[p]=n.shift();',
  '[': 'while(a[p]){',
  ']': '}',
  '?': 'console.log(p,a);',
};
const Execute = (program, input = '', debug) => {
  const instructions = program
    .split('')
    .map((c) => mapping[c] || '')
    .join('\n');
  const inputVals = input.split('').map((c) => c.charCodeAt(0));
  return new Function(
    'n',
    `let a=new Uint8Array(3e4),p=0,o="";${instructions}${
      debug ? `console.log(a);` : ''
    }return o;`
  )(inputVals);
};

const {Test} = require('./test');
const toChars = (s) => s.split('').map((c) => c.charCodeAt(0));
const Check = (code, input, expect, debug) => {
  const bf = kcuf(code, debug);
  if (debug) {
    console.log(code.replace(/(^|\n)\s*/g, '\n'));
    console.log('input:', JSON.stringify(input), toChars(input));
    console.log(bf);
  }
  const result = Execute(bf, input, debug);
  Test.assertEquals(toChars(result), toChars(expect));
  Test.assertEquals(result, expect);
};

Check(
  `
		var X//This is a comment
		read X--This is also a comment
		msg "Bye" X#No doubt it is a comment
		rem &&Some comment~!@#$":<
		`,
  '?',
  'Bye?',
  true
);

Check(
  `
		var A B
		sEt A 'a'
		msg a B
		set B 50
		msG A b
		inc A 10
		dec B -20
		msg A B
		`,
  '',
  'a\0a2kF'
);

Check(
  `
		var X
		set X  114514
		msg X
		set X -114514
		msg X
		set X 'X'
		msg X
		`,
  '',
  '\x52\xae\x58'
);

Check(
  `
		var A B C
		read A
		read B
		add a b c // c = 48 + 7
		msg a b c // 48, 7, 55
		sub a b a // a = 48 - 7
		msg a b c // 41, 7, 55
		mul b a c
		msg a b c
		`,
  '0\x07',
  '\x30\x07\x37\x29\x07\x37\x29\x07\x1f'
);

Check(
  `
		var A B C D
		set A 79
		set B 13
    divmod A B C D
		msg A B C D
		div C D C
		msg A B C D
		mod A D A
		msg A B C D
		`,
  '',
  '\x4f\x0d\x06\x01\x4f\x0d\x06\x01\x00\x0d\x06\x01'
);

// Check(
//   `
// 		var X K
// 		read X
// 		cmp 80 X K
// 		msg X K
// 		// cmp X 'z' K
// 		// msg X K
// 		// cmp X X K
// 		// msg X K
// 		`,
//   // '\x80',
//   String.fromCharCode(200),
//   '\x80\xff', //\x80\x01\x80\x00',
//   'debug'
// );
