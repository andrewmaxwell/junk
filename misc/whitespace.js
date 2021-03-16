const parseNum = (str) =>
  (str[0] === ' ' ? 1 : -1) *
    parseInt(str.slice(1, -1).replace(/ /g, 0).replace(/\t/g, 1), 2) || 0;

const pop = (stack) => {
  if (!stack.length) throw new Error('Stack empty!');
  return stack.pop();
};

const jump = (env, label) => {
  if (!env.labels[label]) throw new Error('Label does not exist');
  env.inst = env.labels[label] - 1;
};

const commands = [
  {
    com: '\n\n\n',
    func: (env) => (env.done = true),
  },
  {
    com: '\n  ',
    argType: 'label',
  },
  {
    com: '\n \t',
    argType: 'label',
    func: (env, label) => {
      env.caller = env.inst;
      jump(env, label);
    },
  },
  {
    com: '\n \n',
    argType: 'label',
    func: jump,
  },
  {
    com: '\n\t\n',
    func: (env) => {
      if (env.caller === undefined) throw new Error('Not in a subroutine');
      env.inst = env.caller;
    },
  },
  {
    com: '\n\t ',
    argType: 'label',
    func: (env, label) => {
      if (pop(env.stack) === 0) jump(env, label);
    },
  },
  {
    com: '\n\t\t',
    argType: 'label',
    func: (env, label) => {
      if (pop(env.stack) < 0) jump(env, label);
    },
  },
  {
    com: ' \n\n',
    func: ({stack}) => pop(stack),
  },
  {
    com: ' \n ',
    func: ({stack}) => {
      const a = pop(stack);
      stack.push(a, a);
    },
  },
  {
    com: ' \n\t',
    func: ({stack}) => stack.push(pop(stack), pop(stack)),
  },
  {
    com: '  ',
    argType: 'number',
    func: ({stack}, arg) => stack.push(arg),
  },
  {
    com: ' \t\n',
    argType: 'number',
    func: ({stack}, arg) => {
      const top = pop(stack);
      stack.length = arg < 0 || arg > stack.length ? 0 : stack.length - arg;
      stack.push(top);
    },
  },
  {
    com: ' \t ',
    argType: 'number',
    func: ({stack}, arg) => {
      const index = stack.length - 1 - arg;
      if (index < 0 || index >= stack.length) throw new Error('Out of bounds');
      stack.push(stack[stack.length - 1 - arg]);
    },
  },
  {
    com: '\t\n  ',
    func: (env) => (env.output += String.fromCharCode(pop(env.stack))),
  },
  {
    com: '\t\n \t',
    func: (env) => (env.output += pop(env.stack)),
  },
  {
    com: '\t   ',
    func: ({stack}) => stack.push(pop(stack) + pop(stack)),
  },
  {
    com: '\t  \t',
    func: ({stack}) => {
      const a = pop(stack);
      stack.push(pop(stack) - a);
    },
  },
  {
    com: '\t  \n',
    func: ({stack}) => stack.push(pop(stack) * pop(stack)),
  },
  {
    com: '\t \t ',
    func: ({stack}) => {
      const a = pop(stack);
      if (!a) throw new Error(`Can't divide by zero!`);
      stack.push(Math.floor(pop(stack) / a));
    },
  },
  {
    com: '\t \t\t',
    func: ({stack}) => {
      const a = pop(stack);
      if (!a) throw new Error(`Can't mod by zero!`);
      stack.push(((pop(stack) % a) + a) % a);
    },
  },
  {
    com: '\t\t ',
    func: ({stack, heap}) => {
      const a = pop(stack);
      heap[pop(stack)] = a;
    },
  },
  {
    com: '\t\t\t',
    func: ({stack, heap}) => {
      const value = heap[pop(stack)];
      if (value === undefined) throw new Error('Bad heap address');
      stack.push(value);
    },
  },
  {
    com: '\t\n\t ',
    func: (env) => {
      if (!env.input.length) throw new Error('No input');
      env.heap[pop(env.stack)] = env.input[0].charCodeAt(0);
      env.input = env.input.slice(1);
    },
  },
  {
    com: '\t\n\t\t',
    func: (env) => {
      const index = env.input.indexOf('\n');
      if (index === -1) throw new Error('No number!');
      env.heap[pop(env.stack)] = parseInt(env.input.slice(0, index));
      env.input = env.input.slice(index + 1);
    },
  },
];

const parse = (code) => {
  code = code.replace(/[^ \t\n]/g, '');
  const instructions = [];
  const labels = {};
  for (let i = 0; i < code.length; ) {
    const sliced = code.slice(i);
    const command = commands.find(({com}) => sliced.startsWith(com));
    if (!command) throw new Error('BAD! ' + sliced);
    const {com, argType} = command;
    i += com.length;
    if (argType === 'number') {
      const argStr = (sliced.slice(com.length).match(/^[ \t]+\n/) || [])[0];
      if (!argStr) throw new Error(`BAD NUMBER: ${sliced}`);
      i += argStr.length;
      instructions.push({command, arg: parseNum(argStr)});
    } else if (argType === 'label') {
      const arg = (sliced.slice(com.length).match(/^[ \t]*\n/) || [])[0];
      i += arg.length;
      if (com === '\n  ') {
        if (labels[arg]) throw new Error('Label already exists!');
        labels[arg] = instructions.length;
      } else instructions.push({command, arg});
    } else instructions.push({command});
  }
  return {instructions, labels};
};

const whitespace = (code, input = '') => {
  const {instructions, labels} = parse(code);
  const env = {stack: [], heap: {}, labels, input, output: '', inst: 0};
  while (!env.done) {
    const {command, arg} = instructions[env.inst];
    command.func(env, arg);
    env.inst++;
  }
  if (!env.done) throw new Error('Unclean termination!');
  return env.output;
};

const {Test} = require('./test');
var output1 = '   \t\n\t\n \t\n\n\n';
var output2 = '   \t \n\t\n \t\n\n\n';
var output3 = '   \t\t\n\t\n \t\n\n\n';
var output0 = '    \n\t\n \t\n\n\n';

Test.assertEquals(whitespace(output1), '1');
Test.assertEquals(whitespace(output2), '2');
Test.assertEquals(whitespace(output3), '3');
Test.assertEquals(whitespace(output0), '0');

var outputNegative1 = '  \t\t\n\t\n \t\n\n\n';
var outputNegative2 = '  \t\t \n\t\n \t\n\n\n';
var outputNegative3 = '  \t\t\t\n\t\n \t\n\n\n';

Test.assertEquals(whitespace(outputNegative1), '-1');
Test.assertEquals(whitespace(outputNegative2), '-2');
Test.assertEquals(whitespace(outputNegative3), '-3');

var outputA = '   \t     \t\n\t\n  \n\n\n';
var outputB = '   \t    \t \n\t\n  \n\n\n';
var outputC = '   \t    \t\t\n\t\n  \n\n\n';

Test.assertEquals(whitespace(outputA), 'A');
Test.assertEquals(whitespace(outputB), 'B');
Test.assertEquals(whitespace(outputC), 'C');

outputA = 'blahhhh   \targgggghhh     \t\n\t\n  \n\n\n';
outputB = ' I heart \t  cats  \t \n\t\n  \n\n\n';
outputC = '   \t  welcome  \t\t\n\t\n to the\nnew\nworld\n';

Test.assertEquals(whitespace(outputA), 'A');
Test.assertEquals(whitespace(outputB), 'B');
Test.assertEquals(whitespace(outputC), 'C');

var pushTwice = '   \t\t\n   \t\t\n\t\n \t\t\n \t\n\n\n';
var duplicate = '   \t\t\n \n \t\n \t\t\n \t\n\n\n';
var duplicateN1 = '   \t\n   \t \n   \t\t\n \t  \t \n\t\n \t\n\n\n';
var duplicateN2 = '   \t\n   \t \n   \t\t\n \t  \t\n\t\n \t\n\n\n';
var duplicateN3 = '   \t\n   \t \n   \t\t\n \t   \n\t\n \t\n\n\n';
var swap = '   \t\t\n   \t \n \n\t\t\n \t\t\n \t\n\n\n';
var discard = '   \t\t\n   \t \n \n\t \n\n\t\n \t\n\n\n';
var slide =
  '   \t\t\n   \t \n   \t\n   \t  \n   \t\t \n   \t \t\n   \t\t\t\n \n\t \t\n \t\t\n\t\n \t\t\n \t\t\n \t\t\n \t\n\n\n';

Test.assertEquals(whitespace(pushTwice), '33');
Test.assertEquals(whitespace(duplicate), '33');
Test.assertEquals(whitespace(duplicateN1), '1');
Test.assertEquals(whitespace(duplicateN2), '2');
Test.assertEquals(whitespace(duplicateN3), '3');
Test.assertEquals(whitespace(swap), '32');
Test.assertEquals(whitespace(discard), '2');
Test.assertEquals(whitespace(slide), '5123');

[
  ['sstntnstnnn', '0'],
  ['snsnnn', Error],
  ['ssstnssstsnsssttnstssttntnstnnn', Error],
  ['ssstnssstsnsssttnstnttsssssntnsttnstnnn', Error],
  ['ssstnssstsnsssttnstntstssntnsttnstnnn', Error],
  ['ssstnttttnstnnn', Error],
  ['ssstnttsnnn', Error],
  ['ssststnssttsntstttnstnnn', '-1'],
  ['ssststnsstttntstttnstnnn', '-1'],
  [
    'ssstntnttssstsntnttsssttntnttsssttntttssstsntttssstnttttnsttnsttnstnnn',
    '123',
    '1\n2\n3\n',
  ],
  [
    'ssstntnttssstsntnttsssttntnttsssttntttssstsntttssstnttttnsttnsttnstnnn',
    '123',
    '0x1\n0x2\n0x3\n',
  ],
  [
    'ssstntnttssstsntnttsssttntnttsssttntttssstsntttssstnttttnsttnsttnstnnn',
    Error,
    '1\n2\n',
  ],
  [
    'ssstntntsssstsntntssssttntntsssstssntntsssststntntsssststntttssstssntttsssttntttssstsntttssstnttttnsstnsstnsstnsstnssnnn',
    '12345',
    '12345',
  ],
  ['ssstnsssttnsssnssstsnsssnssstnnssntnstntsnnnn', '123', ''],
  ['sstttnnssnsnsssttntssntnstssstntssssnsnttnnnn', '321'],
  ['ssstnssstsnsssttntnstnsnntnsttnstssstnssstsnnssnnnn', '3'],
  ['ssstnssstsnsssttntnstnsnntnsttnstnssnnssnnnn', Error],
  ['nsssnssstntnstnnnntnnnn', '1'],
  ['nstsnsssttnnstsnssstnnstsnnnnnsssntnstnnn', Error],
].forEach(([code, expected, input]) => {
  const go = () =>
    whitespace(
      code.replace(/s/g, ' ').replace(/t/g, '\t').replace(/n/g, '\n'),
      input
    );
  if (expected === Error) Test.expectError(go);
  else Test.assertEquals(go(), expected);
});
