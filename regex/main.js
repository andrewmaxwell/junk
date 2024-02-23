import {memoize} from '../misc/memoize.js';
import {isMatch} from './isMatch.js';
import {parseRegex} from './parseRegex.js';
import {toNFA} from './toNFA.js';

const compileRegex = memoize((pattern) => toNFA(parseRegex(pattern)));

export const regexMatch = (pattern, str) => isMatch(compileRegex(pattern), str);

console.assert(regexMatch('a(bc)+(d*|e)', 'abcbcbcddddd') === true);
console.assert(regexMatch('a(bc)+(d*|e)', 'abcbcbcddddde') === false);
