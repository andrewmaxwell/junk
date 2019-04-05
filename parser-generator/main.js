import {tokenize} from '../ramda-compiler/tokenize.js';
import {generateParser} from './generateParser.js';
const {reject, propEq, tap, pipe, append} = window.R;

const parse = generateParser({
  main: 'statement+ EOF',
  statement: 'declaration|exprStatement|returnStatement',
  declaration: 'declarationType id = expr ;',
  declarationType: 'var|let|const',
  dottable: 'object|array|parenthetical|property|index|functionCall|id|string',
  expr: 'functionDef|infixGroup|assignment|dottable|number|boolean',
  exprStatement: 'expr ;',
  returnStatement: 'return expr ;',

  functionDef: 'args => exprOrBlock',
  args: 'id|argList',
  argList: '( commaIdList? )',
  commaIdList: 'id commaId*',
  commaId: ', id',

  exprOrBlock: 'expr|block',
  block: '{ statement+ }',

  infixGroup: 'expr infixOpExpr+',
  infixOpExpr: 'infixOp expr',
  infixOp: '+|-|*|/|<|<=|>|>=|===|==',

  assignment: 'id assignmentOp expr',
  assignmentOp: '=|+=|-=|*=|/=',

  array: '[ commaExprList? ]',
  commaExprList: 'expr commaExpr*',
  commaExpr: ', expr',

  object: '{ keyValPairList? }',
  keyValPairList: 'keyVal commaKeyVal*',
  keyVal: 'id : expr',
  commaKeyVal: ', keyVal',

  parenthetical: '( expr )',
  functionCall: 'dottable ( commaExprList? )',
  property: 'dottable . id',
  index: 'dottable [ expr ]'
});

const textarea = document.querySelector('textarea');
textarea.oninput = () => {
  document.querySelector('pre').innerHTML = pipe(
    tap(v => (localStorage.parseInput = v)),
    tokenize,
    reject(propEq('type', 'space')),
    append({type: 'EOF', value: 'EOF'}),
    // tap(d => console.log('tokens', d)),
    parse,
    d => JSON.stringify(d, null, 2)
  )(textarea.value);
};
textarea.value = localStorage.parseInput;
textarea.oninput();
