export const examples = [
  {
    name: 'JSON',
    grammar: `number: ^(-?\\d+(\\.\\d+)?)\\s*
string: ^"([^"]*)"\\s*

commaValue: , value
valueList: value commaValue*
array: [ valueList? ]

pair: string : value
commaPair: , pair
pairList: pair commaPair*
object: { pairList? }

value: number|string|true|false|null|array|object
main: value`,
    code: `{
  "x": [
    {
      "a": [
        {
          "b": -1.4,
          "c": null,
          "d": "hello?"
        }
      ]
    }
  ],
  "m": true
}`,
  },
  {
    name: 'HTML',
    grammar: `name: ^([a-zA-Z][a-zA-Z0-9-]*)\\s*
text: ^([^<]+)\\s*
string: ^"([^"]*)"\\s*
attributeValue: = string
attributes: name attributeValue?
closeTag: </ name >
tagList: < name attributes* > tagList|text* closeTag?
docType: <!DOCTYPE name >
main: docType? tagList|text*`,
    code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>This is the title</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body style="background: green">
    <h1>Hello, World!</h1>
    <button onClick="alert('do not click me!')">Do not click.</button>
  </body>
</html>`,
  },
  {
    name: 'Lisp',
    grammar: `id: ^([^'"()\\s]+)\\s*
string: ^"([^"]*)"\\s*
number: ^(-?\\d+(\\.\\d+)?)\\s*

sExpr: ( number|sExpr|quoted|id|string* )
quoted: ' sExpr|id
main: number|sExpr|quoted|id|string*`,
    code: `(defun reduce (func acc arr) 
  (cond (arr (reduce func (func acc (car arr)) (cdr arr))) 
    ('t acc)))

(defun nestOps (r arg) 
  (cons (car arg) (cons r (cdr arg))))

(defmacro -> (args)
  (reduce nestOps (car args) (cdr args))
)

(defun funTime (m)
  (-> m (/ 4) (+ 1) (* m))
)

(funTime 10)`,
  },
  {
    name: 'ES6',
    grammar: `id: ^(?!(for|const|let|var|function|new|await|import|export|while|in|with|try|catch|break|true|false|null|undefined|class)\\b)[a-zA-Z_$][a-zA-Z0-9_$]*\\s*
string: ^('[^']*'|"[^"]*")\\s*
number: ^-?\\d+(\\.\\d+)?\\s*
or: ^\\|\\|\\s*
regex: ^\\/.*\\/[gi]*\\s*
templateString: ^\`[^\`]*\`\\s*
comment: ^//\\s*.*\\s*|^/\\*.*\\*/\\s*
boolean: true|false

moreExprList: , expr?
exprList: expr? moreExprList*
parenExpr: ( exprList? )
bracketExpr: [ exprList? ]

block: { statementList }

method: id parenExpr block
keyValPair: id|string : expr
objSpread: ... expr
moreObjectItems: , keyValPair|method|id
objectItems: keyValPair|method|id|objSpread moreObjectItems* ,?
object: { objectItems? }

namedClass: class id { method* }

arrowFunction: parenExpr => expr|block
namedFunction: function id parenExpr block

infixExpr: +=|+|-=|-|*=|*|/=|!==|!=|/|===|==|=|<=|<|>=|>|%=|%|&&|or|instanceof|in expr
ternary: ? expr : expr
property: . id|bracketExpr
moreExpr: infixExpr|ternary|++|--|property|parenExpr|bracketExpr moreExpr?
expr: ...? typeof? await? !|-? new? number|boolean|null|undefined|id|string|templateString|arrowFunction|namedFunction|namedClass|parenExpr|bracketExpr|object|regex moreExpr?

initialization: = expr
destructureRename: : id
destructurePair: id initialization|objDestructure|destructureRename?
commaDestructurePair: , destructurePair
destructurePairs: destructurePair commaDestructurePair*
objDestructure: { destructurePairs? }

moreVars: , varDeclaration
varDeclaration: id|bracketExpr|objDestructure initialization? moreVars?
declaration: var|let|const varDeclaration ;?

exprStatement: expr ;?
forLoop: for ( declaration|exprStatement exprStatement expr ) block|exprStatement
forOfLoop: for ( var|let|const id of|in expr ) block|exprStatement
whileLoop: while parenExpr block|exprStatement
statementList: statement ;? statementList?
tryCatch: try block catch ( id ) block
returnStatement: return expr ;?
ifStatement: if parenExpr block|statement elseStatement?
elseStatement: else block|statement
statement: comment|forLoop|forOfLoop|whileLoop|declaration|ifStatement|exprStatement|returnStatement|tryCatch|break

exportStatement: export declaration|namedFunction|namedClass
importStatement: import id|object from string ;
main: importStatement|exportStatement|statement main?`,
    code: await (await fetch('./parse.js')).text(),
  },
  {
    name: 'SQL',
    grammar: `id: ^([a-zA-Z_$][a-zA-Z0-9_$]*|"[a-zA-Z_$][a-zA-Z0-9_$]*")\\s*
number: ^(-?\\d+(\\.\\d+)?)\\s*
tableQualifier: id .
columnAlias: AS id
column: tableQualifier? id columnAlias?
parenExpr: ( expr )
moreExpr: =|!=|<>|<=|<|>=|>|AND|OR expr
expr: number|column|*|parenExpr moreExpr?
moreExprList: , exprList
exprList: expr moreExprList?
onClause: ON expr
joins: INNER|OUTER|LEFT|RIGHT? JOIN id id? onClause? joins?
whereClause: WHERE expr
limitClause: LIMIT expr
selectStatement: SELECT exprList FROM expr id? joins? whereClause? limitClause? ;?
main: selectStatement`,
    code: `SELECT bs."businessGroupId", bsc.id AS "businessBlockId"
FROM "businessStructure" bs
JOIN "businessGroup" bg
  ON bs."businessGroupId" = bg.id
JOIN "businessStructureChildren" bsc
  ON bs.id = bsc."businessStructureId"
WHERE id = 10
LIMIT 1;`,
  },
  {
    name: 'BF',
    grammar: `loop: [ inst* ]
inst: +|-|>|<|.|,|loop
main: inst*`,
    code: `++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.`,
  },
];
