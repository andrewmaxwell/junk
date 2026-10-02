// Run with: node --test lambdagator/test/*.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProgram,
  reduceStep,
  toString,
  recognize,
  origin,
  knownValues,
  foldValues,
} from '../lambda.js';

// reduces in normal order, returning the final term and how many steps it took
const evaluate = (src, maxSteps = 500) => {
  let {tree, defs} = parseProgram(src);
  let steps = 0;
  for (let step; (step = reduceStep(tree, defs)); steps++) {
    if (steps === maxSteps) return {tree, defs, steps, finished: false};
    tree = step.result;
  }
  return {tree, defs, steps, finished: true};
};

test('parses shorthand, backslashes, and parentheses', () => {
  assert.equal(toString(parseProgram('\\ab.aba').tree), 'λab.aba');
  assert.equal(toString(parseProgram('(λx.x) (y)').tree), '(λx.x)y');
  assert.equal(toString(parseProgram('a (b c) d').tree), 'a(bc)d');
});

test('explains parse errors', () => {
  for (const [src, message] of [
    ['(λa.a', 'Expected ")" but found the end'],
    ['λ.a', 'Expected a variable after λ but found "."'],
    ['a)', 'Unexpected ")"'],
    ['', 'Nothing to evaluate'],
    ['FOO', 'FOO is not defined'],
    ['X = λ.a\nX', 'In X: Expected a variable after λ but found "."'],
    ['200', '200 is too big. Numbers go up to 100.'],
  ]) {
    assert.throws(() => parseProgram(src), {message}, src);
  }
});

test('reduces to normal form', () => {
  for (const [src, result, steps] of [
    ['(λab.aba)(λab.a)(λab.b)', 'λab.b', 4],
    ['AND TRUE FALSE', 'FALSE', 6],
    ['ADD 2 3', 'λfx.f(f(f(f(fx))))', 9],
    ['S K K', 'λz.z', 6],
    ['TWICE = λfx.f(fx)\nTWICE NOT TRUE', 'λab.a', 12],
  ]) {
    const end = evaluate(src);
    assert.equal(toString(end.tree), result, src);
    assert.equal(end.steps, steps, src);
  }
});

test('normal order skips an argument that never finishes', () => {
  const end = evaluate('K I ((λx.xx)(λx.xx))');
  assert.equal(toString(end.tree), 'I');
  assert.equal(evaluate('(λx.xx)(λx.xx)', 50).finished, false);
});

test('renames to avoid capturing a free variable', () => {
  const {tree, defs} = parseProgram('(λxy.yx)y');
  const step = reduceStep(tree, defs);
  assert.deepEqual(
    step.renamed.map(({from, to}) => [from, to]),
    [['y', 'a']],
  );
  assert.equal(toString(step.result), 'λa.ay');
});

test('records copies so they can be animated from the original', () => {
  const {tree, defs} = parseProgram('(λx.xxx)(λy.y)');
  const step = reduceStep(tree, defs);
  assert.equal(step.copies.length, 3);
  assert.equal(step.copies[0], tree.arg); // the first occurrence gets the argument itself
  for (const copy of step.copies.slice(1)) {
    assert.equal(origin.get(copy.id), tree.arg.id);
  }
});

test('can reduce a step other than the normal order one', () => {
  const {tree, defs} = parseProgram('(λb.(λab.a)b)(λab.b)');
  const inner = tree.fn.body; // (λab.a)b
  const step = reduceStep(tree, defs, inner.id);
  assert.equal(toString(step.result), '(λbc.b)(λab.b)');
});

test('recognizes results by name and number', () => {
  const check = (src, names) => {
    const {tree, defs} = evaluate(src);
    assert.deepEqual(recognize(tree, defs), names, src);
  };
  check('NOT TRUE', ['FALSE', '0']);
  check('ADD 2 3', ['5']);
  check('S K K', ['I']);
  check('PRED 2', ['1']);
});

test('writes terms that parse back to themselves', () => {
  for (const src of ['AND TRUE FALSE', 'POW 2 2', 'f 2', 'x TRUE y']) {
    let {tree, defs} = parseProgram(src);
    for (let i = 0; tree && i < 30; i++) {
      const text = toString(tree);
      assert.equal(toString(parseProgram(text).tree), text);
      tree = reduceStep(tree, defs)?.result;
    }
  }
});

test('folds recursion back into its name, without getting stuck', () => {
  const src = 'FACT = Y (λfn.ISZERO n 1 (MUL n (f (PRED n))))\nFACT 2';
  let {tree, defs} = parseProgram(src);
  const known = knownValues(tree, defs);
  let steps = 0;
  let folds = 0;
  for (let step; (step = reduceStep(tree, defs)); steps++) {
    assert.ok(steps < 500, 'it should finish');
    const folded = foldValues(step.result, known);
    folds += folded.folds.length;
    tree = folded.tree;
  }
  assert.ok(folds > 0);
  assert.deepEqual(recognize(tree, defs), ['2']);
});

test('only folds names the program uses, and never ambiguous ones', () => {
  // no names, so nothing to fold
  assert.equal(
    knownValues(parseProgram('(λx.xx)(λy.y)').tree, new Map()).size,
    0,
  );
  // λab.b is both FALSE and 0 here, so it's left alone
  const {tree, defs} = parseProgram('ISZERO 2');
  const known = knownValues(tree, defs);
  const names = [...known.values()];
  assert.ok(names.includes('TRUE') && names.includes('2'));
  assert.ok(!names.includes('FALSE') && !names.includes('0'));
});
