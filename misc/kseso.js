const dirs = {
  right: {x: 1, y: 0},
  down: {x: 0, y: 1},
  left: {x: -1, y: 0},
  up: {x: 0, y: -1},
};

const getDir = (name) => {
  const dir = dirs[name];
  if (!dir) throw new Error(`wtf is this direction: "${name}"`);
  return dir;
};

const math =
  (func) =>
  ({get, set, x, y}, dirName) => {
    const dir = getDir(dirName);
    set(func(get(), get(x + dir.x, y + dir.y)));
  };

const executeLine = (env, line) => {
  const [opCode, ...args] = line;
  if (!ops[opCode]) throw new Error(`wtf does "${opCode}" mean`);
  ops[opCode](env, ...args);
};

const ops = {
  esoS: ({set}, val) => set(val),
  go: (env, dirName) => {
    const {x, y} = getDir(dirName);
    env.x += x;
    env.y += y;
  },
  copy: ({get, set, x, y}, dirName) => {
    const dir = getDir(dirName);
    set(get(), x + dir.x, y + dir.y);
  },
  mod: math((a, b) => a % b),
  add: math((a, b) => a + b),
  sub: math((a, b) => a - b),
  if: (env, dir1, dir2) => {
    ops.go(env, env.get() ? dir1 : dir2);
  },
  print: ({get, print}) => {
    print(get());
  },
  dontDo: ({set}, ...args) => {
    set(args);
  },
  meLlamo: ({labels, inst, x, y}, name) => {
    labels[name] = {inst, x, y};
  },
  do: (env) => {
    if (!Array.isArray(env.get()))
      throw new Error(`wtf you can't do "${env.get()} at ${env.x},${env.y}`);
    executeLine(env, env.get());
  },
  shootGoBackToTheSpotCalled: (env, label) => {
    if (!env.labels[label]) throw new Error(`wtf is this label "${label}`);
    Object.assign(env, env.labels[label]);
  },
};

const run = (prog) => {
  const code = prog
    .split(',')
    .filter((line) => line.trim())
    .map((line) => line.trim().split(/\s+/))
    .filter((line) => line[0] !== 'doesnt');

  const env = {
    x: 0,
    y: 0,
    get: (x = env.x, y = env.y) => env.memory[x + ',' + y],
    set: (val, x = env.x, y = env.y) =>
      (env.memory[x + ',' + y] = isNaN(val) ? val : Number(val)),
    print: (val) => (env.output += val + '\n'),
    labels: code.reduce((res, line, inst) => {
      if (line[0] === 'meLlamo') res[line[1]] = {inst};
      return res;
    }, {}),
    inst: 0,
    output: '',
    memory: {},
  };

  while (code[env.inst]) {
    executeLine(env, code[env.inst]);
    env.inst++;
  }
  return env.output;
};

const {Test} = require('./test');
Test.assertDeepEquals(
  run(`doesnt program: a single fizzbuzz,

doesnt init values,
esoS 20,
go right,
esoS 5,
go left,
go down,
esoS buzz,
go up,

doesnt do the thing!,
copy up,
mod right,
if up down,
print
`),
  'buzz\n'
);

Test.assertDeepEquals(
  run(`doesnt print 1-100,
  esoS 1,
  go right,
  esoS 1,
  go up,
  esoS 101,
  go left,
  go up,
  dontDo shootGoBackToTheSpotCalled loop,
  go down,
  go left,
  dontDo shootGoBackToTheSpotCalled quit,
  go right,
  go down,

  meLlamo loop,
  print,
  add right,
  copy up,
  go up,
  sub right,
  if up left,
  do,

  meLlamo quit`),
  '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20\n21\n22\n23\n24\n25\n26\n27\n28\n29\n30\n31\n32\n33\n34\n35\n36\n37\n38\n39\n40\n41\n42\n43\n44\n45\n46\n47\n48\n49\n50\n51\n52\n53\n54\n55\n56\n57\n58\n59\n60\n61\n62\n63\n64\n65\n66\n67\n68\n69\n70\n71\n72\n73\n74\n75\n76\n77\n78\n79\n80\n81\n82\n83\n84\n85\n86\n87\n88\n89\n90\n91\n92\n93\n94\n95\n96\n97\n98\n99\n100\n'
);

Test.assertDeepEquals(
  run(`

  doesnt setup
  esoS 1,


  doesnt if divisible by 15 print FizzBuzz,
  meLlamo div15,
  mod left,
  if down right,


  doesnt else if divisible by 3 print Fizz,
  meLlamo div3,
  mod left,
  if down right,


  doesnt else if divisible by 5 print Buzz,
  meLlamo div5,
  mod left,
  if down right,


  doesnt else print N,
  print,

  doesnt increment,


  doesnt if N < 101 loop,

  
  `),
  '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n16\n17\nFizz\n19\nBuzz\nFizz\n22\n23\nFizz\nBuzz\n26\nFizz\n28\n29\nFizzBuzz\n31\n32\nFizz\n34\nBuzz\nFizz\n37\n38\nFizz\nBuzz\n41\nFizz\n43\n44\nFizzBuzz\n46\n47\nFizz\n49\nBuzz\nFizz\n52\n53\nFizz\nBuzz\n56\nFizz\n58\n59\nFizzBuzz\n61\n62\nFizz\n64\nBuzz\nFizz\n67\n68\nFizz\nBuzz\n71\nFizz\n73\n74\nFizzBuzz\n76\n77\nFizz\n79\nBuzz\nFizz\n82\n83\nFizz\nBuzz\n86\nFizz\n88\n89\nFizzBuzz\n91\n92\nFizz\n94\nBuzz\nFizz\n97\n98\nFizz\nBuzz\n'
);
