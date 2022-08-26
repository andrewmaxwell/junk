// https://www.codewars.com/kata/597ccf7613d879c4cb00000f/train/javascript

const nest = (tokens, openToken, closeToken, childFunc = (x) => x) => {
  const indexes = [];
  const result = [];
  for (const t of tokens) {
    if (t === openToken) indexes.push(result.length);
    else if (t === closeToken) {
      if (!indexes.length) return null;
      result.push(childFunc(result.splice(indexes.pop())));
    } else result.push(t);
  }
  return indexes.length ? null : result;
};

const treeMap = (func) => (tree) =>
  func(Array.isArray(tree) ? tree.map(treeMap(func)) : tree);

const parseFunctionCalls = treeMap((node) =>
  Array.isArray(node)
    ? node.reduce((res, el) => {
        res.push(
          Array.isArray(el) && typeof res[res.length - 1] === 'string'
            ? [res.pop(), ...el]
            : el
        );
        return res;
      }, [])
    : node
);

const parseLambda = (node) => {
  const arrowIndex = node.indexOf('->');
  return arrowIndex < 0
    ? ['lambda', [], ...node]
    : ['lambda', node.slice(0, arrowIndex), ...node.slice(arrowIndex + 1)];
};

const nestLambdas = treeMap((node) =>
  Array.isArray(node) ? nest(node, '{', '}', parseLambda) : node
);

const toTarget = (ast) => {
  if (!Array.isArray(ast)) return ast;
  const [func, ...args] = ast;
  if (func === 'lambda') {
    const [lambdaArgs, ...body] = args;
    return `(${lambdaArgs.join(',')}){${body.map(toTarget).join(',')}}`;
  }
  return `${func}(${args.map(toTarget).join(',')})`;
};

const transpile = (str) => {
  const tokens = str.match(/[(){}]|->|[a-z]+|\d+/gi);
  const nestedParens = nest(tokens, '(', ')');
  if (!nestedParens) return null;

  const nested = nestLambdas(nestedParens);
  if (!nested) return null;

  console.dir(nested, {depth: Infinity});
  const withFuncs = parseFunctionCalls(nested);
  console.dir(withFuncs, {depth: Infinity});
  return withFuncs.map(toTarget).join('');
};

import {Test, it} from './test.js';
Test.failFast = true;
const fromTo = (a, b) => {
  console.log(a);
  Test.assertEquals(transpile(a), b);
};
const shouldFail = (a) => Test.assertEquals(transpile(a), null);

it('Should work when expressions are very simple', function () {
  fromTo('call()', 'call()');
  fromTo('callFunc(a)', 'callFunc(a)');
  fromTo('callFunc(123)', 'callFunc(123)');
});
it('Should not parse wtf', function () {
  shouldFail('%^&*(');
  shouldFail('x9x92xb29xub29bx120()!(');
});
it("Should work when there're multiple parameters", function () {
  fromTo('invoke(a, 1, b, 2)', 'invoke(a,1,b,2)');
});

it('Should work for simple tests', function () {
  fromTo('call({})', 'call((){})');
});
it('Should work for lambdas with single paramter', function () {
  fromTo('f({a->})', 'f((a){})');
});

it('Should work for empty lambdas', function () {
  fromTo('call(\n){}', 'call((){})');
  fromTo('call{}', 'call((){})');
});
it("Should work when there're parameters", function () {
  fromTo('f(x){a->}', 'f(x,(a){})');
  shouldFail('f(){->a}');
});
it("Should work when there're no parameters but statements", function () {
  fromTo('run{a}', 'run((){a;})');
});

it("Should work when it('s bare", function () {
  fromTo('{}()', '(){}()');
});
it("Should work when there're parameters", function () {
  fromTo('{a->a}(233)', '(a){a;}(233)');
});
