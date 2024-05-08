import {Test} from '../misc/test.js';
import {examples} from './examples.js';
import {isMatch2} from './isMatch.js';
import {parseRegex} from './parseRegex.js';
import {toNFA} from './toNFA.js';

Test.failFast = true;
console.time('tests');

for (const {
  pattern,
  ast: expectedAST,
  nfa: expectedNFA,
  matches,
  nonMatches,
} of examples) {
  console.log(pattern);

  const ast = parseRegex(pattern);
  Test.assertDeepEquals(ast, expectedAST);

  const nfa = toNFA(ast);
  Test.assertDeepEquals(nfa, expectedNFA);

  for (const str of matches) {
    Test.assertDeepEquals(
      isMatch2(nfa, str),
      true,
      `"${str}" should match "${pattern}"`
    );
  }
  for (const str of nonMatches) {
    Test.assertDeepEquals(
      isMatch2(nfa, str),
      false,
      `"${str}" should not match "${pattern}"`
    );
  }
}

console.timeEnd('tests');

const count = examples
  .map((t) => 2 + t.matches.length + t.nonMatches.length)
  .reduce((a, b) => a + b);

console.log(count, 'tests');
