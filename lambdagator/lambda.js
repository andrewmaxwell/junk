// Terms are immutable trees of
//   {type: 'var', name} | {type: 'lam', param, body} | {type: 'app', fn, arg} | {type: 'ref', name}
// where a ref is a named definition like TRUE or 2 that gets unfolded when it's needed.
// Every node has an id that survives reduction steps, so the renderer can tell which pieces moved.
// When an argument is substituted more than once, the extra copies get new ids and `origin` records
// which node each copy came from, so the copies can fly out of the original. Nodes made by
// unfolding a ref are recorded in `unfoldedFrom`, so they can grow out of it.

let nextId = 1;
export const origin = new Map();
export const unfoldedFrom = new Map();

const mk = (node) => ({...node, id: nextId++});

const copyTree = (n, onCopy) => {
  const copy =
    n.type === 'lam'
      ? mk({...n, body: copyTree(n.body, onCopy)})
      : n.type === 'app'
        ? mk({...n, fn: copyTree(n.fn, onCopy), arg: copyTree(n.arg, onCopy)})
        : mk(n);
  onCopy(copy, n);
  return copy;
};
const clone = (n) => copyTree(n, (copy, src) => origin.set(copy.id, src.id));

const isVar = (t) => /^[a-z][0-9]*$/.test(t);
const isName = (t) => /^([A-Z][A-Z0-9_]*|\d+)$/.test(t);

const parseExpr = (src) => {
  const tokens =
    src.replace(/\\/g, 'λ').match(/λ|[a-z][0-9]*|[A-Z][A-Z0-9_]*|\d+|\S/g) ||
    [];
  let i = 0;
  const describe = (t) => (t === undefined ? 'the end' : `"${t}"`);
  const expect = (t) => {
    if (tokens[i] !== t) {
      throw new Error(`Expected "${t}" but found ${describe(tokens[i])}`);
    }
    i++;
  };

  const parseLambda = () => {
    i++; // λ
    const params = [];
    while (isVar(tokens[i])) params.push(tokens[i++]);
    if (!params.length) {
      throw new Error(
        `Expected a variable after λ but found ${describe(tokens[i])}`,
      );
    }
    expect('.');

    const body = parseApp();
    return params.reduceRight(
      (body, param) => mk({type: 'lam', param, body}),
      body,
    );
  };

  const parseApp = () => {
    let left;
    while (i < tokens.length && tokens[i] !== ')') {
      let right;
      if (tokens[i] === 'λ') right = parseLambda();
      else if (tokens[i] === '(') {
        i++;
        right = parseApp();
        expect(')');
      } else if (isVar(tokens[i])) {
        right = mk({type: 'var', name: tokens[i++]});
      } else if (isName(tokens[i])) {
        right = mk({type: 'ref', name: tokens[i++]});
      } else throw new Error(`Unexpected ${describe(tokens[i])}`);
      left = left ? mk({type: 'app', fn: left, arg: right}) : right;
    }
    if (!left) {
      throw new Error(
        `Expected an expression but found ${describe(tokens[i])}`,
      );
    }
    return left;
  };

  const tree = parseApp();
  if (i < tokens.length) throw new Error(`Unexpected ${describe(tokens[i])}`);
  return tree;
};

export const prelude = `I = λx.x
K = λxy.x
S = λxyz.xz(yz)
Y = λf.(λx.f(xx))(λx.f(xx))
TRUE = λab.a
FALSE = λab.b
NOT = λpab.pba
AND = λpq.pqp
OR = λpq.ppq
IF = λpab.pab
SUCC = λnfx.f(nfx)
ADD = λmnfx.mf(nfx)
MUL = λmnf.m(nf)
POW = λbe.eb
PRED = λnfx.n(λgh.h(gf))(λu.x)(λu.u)
SUB = λmn.n PRED m
ISZERO = λn.n(λx.FALSE)TRUE
PAIR = λxyf.fxy
FST = λp.p TRUE
SND = λp.p FALSE`;

const parseDefinitions = (src, defs = new Map()) => {
  let main;
  for (const statement of src.split(/[\n;]/)) {
    if (!statement.trim()) continue;
    const def = statement.match(/^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/);
    try {
      if (def) defs.set(def[1], parseExpr(def[2]));
      else if (main) {
        throw new Error(
          'There can only be one expression to evaluate. Put definitions on their own lines, like NAME = λx.x',
        );
      } else main = parseExpr(statement);
    } catch (e) {
      throw new Error(def ? `In ${def[1]}: ${e.message}` : e.message);
    }
  }
  return {defs, main};
};

const preludeDefs = parseDefinitions(prelude).defs;

const numeral = (n) => {
  let body = mk({type: 'var', name: 'x'});
  for (let i = 0; i < n; i++) {
    body = mk({type: 'app', fn: mk({type: 'var', name: 'f'}), arg: body});
  }
  return mk({
    type: 'lam',
    param: 'f',
    body: mk({type: 'lam', param: 'x', body}),
  });
};

export const definition = (name, defs) =>
  /^\d+$/.test(name) ? numeral(Number(name)) : defs.get(name);

const refNames = (n, names = []) => {
  if (n.type === 'ref') names.push(n.name);
  else if (n.type === 'lam') refNames(n.body, names);
  else if (n.type === 'app') {
    refNames(n.fn, names);
    refNames(n.arg, names);
  }
  return names;
};

export const parseProgram = (src) => {
  const {defs, main} = parseDefinitions(src, new Map(preludeDefs));
  if (!main) throw new Error('Nothing to evaluate');
  for (const tree of [main, ...defs.values()]) {
    for (const name of refNames(tree)) {
      if (/^\d+$/.test(name) && Number(name) > 100) {
        throw new Error(`${name} is too big. Numbers go up to 100.`);
      }
      if (!definition(name, defs)) throw new Error(`${name} is not defined`);
    }
  }
  return {tree: main, defs};
};

// Nested lambdas display as one, like λab.x, unless a name repeats (λb.λab.b, not λbab.b).
const lambdaChain = (n) => {
  const chain = [n];
  while (
    n.body.type === 'lam' &&
    !chain.some((l) => l.param === n.body.param)
  ) {
    n = n.body;
    chain.push(n);
  }
  return chain;
};

// Writes a term in the usual notation. Hooks can dress up the pieces:
//   name(text, binder): a variable or name. binder is the id of the lambda a variable belongs to.
//   lambda(chain): the λab. at the front of a chain of lambdas
//   node(n, text): a whole term
// spaced is for applications: whether to put spaces between the things in a chain like f a b c.
export const render = (n, hooks = {}, env = new Map(), spaced) => {
  const {
    name = (text) => text,
    lambda = (chain) => `λ${chain.map((l) => l.param).join('')}.`,
    node = (n, text) => text,
  } = hooks;
  let text;
  if (n.type === 'var') text = name(n.name, env.get(n.name));
  else if (n.type === 'ref') text = name(n.name);
  else if (n.type === 'lam') {
    const chain = lambdaChain(n);
    const inner = new Map(env);
    for (const l of chain) inner.set(l.param, l.id);
    text = lambda(chain) + render(chain.at(-1).body, hooks, inner);
  } else {
    // Names need spaces around them so they don't run into their neighbors, so a chain like
    // f a b c that has any names in it is spaced out all the way along (TRUE x y, not TRUE xy,
    // which looks like one variable).
    if (spaced === undefined) {
      let m = n;
      spaced = false;
      for (; m.type === 'app'; m = m.fn) spaced ||= m.arg.type === 'ref';
      spaced ||= m.type === 'ref';
    }
    const fn = render(
      n.fn,
      hooks,
      env,
      n.fn.type === 'app' ? spaced : undefined,
    );
    const arg = render(n.arg, hooks, env);
    const wrapArg = n.arg.type === 'app' || n.arg.type === 'lam';
    text =
      (n.fn.type === 'lam' ? `(${fn})` : fn) +
      (spaced ? ' ' : '') +
      (wrapArg ? `(${arg})` : arg);
  }
  return node(n, text);
};

export const toString = (n) => render(n);

// ids of every node in a term
export const subtreeIds = (n, ids = new Set()) => {
  ids.add(n.id);
  if (n.type === 'lam') subtreeIds(n.body, ids);
  if (n.type === 'app') {
    subtreeIds(n.fn, ids);
    subtreeIds(n.arg, ids);
  }
  return ids;
};

// applications whose argument is itself an application, which needs grouping
export const groups = (n, ids = new Set()) => {
  if (n.type === 'lam') groups(n.body, ids);
  if (n.type === 'app') {
    if (n.arg.type === 'app') ids.add(n.id);
    groups(n.fn, ids);
    groups(n.arg, ids);
  }
  return ids;
};

export const countNodes = (n) =>
  n.type === 'lam'
    ? 1 + countNodes(n.body)
    : n.type === 'app'
      ? 1 + countNodes(n.fn) + countNodes(n.arg)
      : 1;

const freeVars = (n) => {
  if (n.type === 'var') return new Set([n.name]);
  if (n.type === 'ref') return new Set();
  if (n.type === 'app') {
    return new Set([...freeVars(n.fn), ...freeVars(n.arg)]);
  }
  const vars = freeVars(n.body);
  vars.delete(n.param);
  return vars;
};

const allNames = (n, names = new Set()) => {
  if (n.type === 'var') names.add(n.name);
  else if (n.type === 'lam') {
    names.add(n.param);
    allNames(n.body, names);
  } else if (n.type === 'app') {
    allNames(n.fn, names);
    allNames(n.arg, names);
  }
  return names;
};

const fresh = (used) => {
  for (let i = 0; ; i++) {
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      const name = i ? c + i : c;
      if (!used.has(name)) return name;
    }
  }
};

// rename free occurrences of `from` to `to`, keeping ids
const renameFree = (n, from, to) => {
  if (n.type === 'var') return n.name === from ? {...n, name: to} : n;
  if (n.type === 'ref') return n;
  if (n.type === 'app') {
    return {
      ...n,
      fn: renameFree(n.fn, from, to),
      arg: renameFree(n.arg, from, to),
    };
  }
  return n.param === from ? n : {...n, body: renameFree(n.body, from, to)};
};

// rename any binder inside n that would capture a free variable of the argument
const avoidCapture = (n, x, argVars, used, renamed) => {
  if (n.type === 'var' || n.type === 'ref') return n;
  if (n.type === 'app') {
    return {
      ...n,
      fn: avoidCapture(n.fn, x, argVars, used, renamed),
      arg: avoidCapture(n.arg, x, argVars, used, renamed),
    };
  }
  if (n.param === x || !freeVars(n.body).has(x)) return n;
  if (argVars.has(n.param)) {
    const to = fresh(used);
    used.add(to);
    renamed.push({id: n.id, from: n.param, to});
    n = {...n, param: to, body: renameFree(n.body, n.param, to)};
  }
  return {...n, body: avoidCapture(n.body, x, argVars, used, renamed)};
};

// replace free occurrences of x with the argument. The first occurrence reuses the argument
// itself; the rest are clones.
const subst = (n, x, arg, copies) => {
  if (n.type === 'ref') return n;
  if (n.type === 'var') {
    if (n.name !== x) return n;
    const copy = copies.length ? clone(arg) : arg;
    copies.push(copy);
    return copy;
  }
  if (n.type === 'app') {
    return {
      ...n,
      fn: subst(n.fn, x, arg, copies),
      arg: subst(n.arg, x, arg, copies),
    };
  }
  return n.param === x ? n : {...n, body: subst(n.body, x, arg, copies)};
};

const occurrences = (n, x, ids = []) => {
  if (n.type === 'var') {
    if (n.name === x) ids.push(n.id);
  } else if (n.type === 'app') {
    occurrences(n.fn, x, ids);
    occurrences(n.arg, x, ids);
  } else if (n.type === 'lam' && n.param !== x) occurrences(n.body, x, ids);
  return ids;
};

// Normal order: leftmost, outermost first. Returns an application of a lambda, or a ref that
// needs to be unfolded because it's being applied to something.
const findRedex = (n) => {
  if (n.type === 'lam') return findRedex(n.body);
  if (n.type !== 'app') return;
  if (n.fn.type === 'lam') return n;
  if (n.fn.type === 'ref') return n.fn;
  return findRedex(n.fn) || findRedex(n.arg);
};

const findNode = (n, id) => {
  if (n.id === id) return n;
  if (n.type === 'lam') return findNode(n.body, id);
  if (n.type === 'app') return findNode(n.fn, id) || findNode(n.arg, id);
};

const replace = (n, id, replacement) => {
  if (n.id === id) return replacement;
  if (n.type === 'lam') return {...n, body: replace(n.body, id, replacement)};
  if (n.type === 'app') {
    return {
      ...n,
      fn: replace(n.fn, id, replacement),
      arg: replace(n.arg, id, replacement),
    };
  }
  return n;
};

// Does one step: either unfolds a ref or β-reduces an application. With no target, picks the
// normal order redex.
export const reduceStep = (tree, defs, targetId) => {
  const target =
    targetId === undefined ? findRedex(tree) : findNode(tree, targetId);
  if (!target) return;

  if (target.type === 'ref') {
    const def = definition(target.name, defs);
    const expansion = copyTree(def, (copy) =>
      unfoldedFrom.set(copy.id, target.id),
    );
    return {
      kind: 'unfold',
      ref: target,
      definition: def,
      expansion,
      result: replace(tree, target.id, expansion),
    };
  }

  const {fn: lam, arg} = target;
  const renamed = [];
  const body = avoidCapture(
    lam.body,
    lam.param,
    freeVars(arg),
    allNames(tree),
    renamed,
  );
  const renamedLam = {...lam, body};
  const copies = [];
  const newBody = subst(body, lam.param, arg, copies);
  return {
    kind: 'beta',
    redex: target,
    lam: renamedLam,
    occurrences: occurrences(lam.body, lam.param),
    renamed,
    renamedTree: replace(tree, target.id, {...target, fn: renamedLam}),
    // the lambda with its parameter replaced but not yet gone, for showing the copies landing
    hatching: replace(tree, target.id, {...renamedLam, body: newBody}),
    copies,
    body: newBody,
    result: replace(tree, target.id, newBody),
  };
};

// Recognizing results: fully normalize (unfolding every ref) and compare, ignoring variable names.

const unfoldAll = (n, defs) =>
  n.type === 'ref'
    ? copyTree(definition(n.name, defs), () => {})
    : n.type === 'lam'
      ? {...n, body: unfoldAll(n.body, defs)}
      : n.type === 'app'
        ? {...n, fn: unfoldAll(n.fn, defs), arg: unfoldAll(n.arg, defs)}
        : n;

const normalize = (tree, defs) => {
  let steps = 0;
  for (let round = 0; round < 10; round++) {
    for (let step; (step = reduceStep(tree, defs)); tree = step.result) {
      if (++steps > 300 || countNodes(step.result) > 2000) return;
    }
    if (!refNames(tree).length) return tree;
    tree = unfoldAll(tree, defs);
  }
};

// The term with de Bruijn indexes instead of variable names, so terms that only differ by
// variable names come out the same
export const canonical = (n, env = []) =>
  n.type === 'var'
    ? env.includes(n.name)
      ? String(env.indexOf(n.name))
      : n.name
    : n.type === 'ref'
      ? '#' + n.name
      : n.type === 'lam'
        ? 'λ' + canonical(n.body, [n.param, ...env])
        : `(${canonical(n.fn, env)} ${canonical(n.arg, env)})`;

const canonicalDefs = new WeakMap();

// names (and the number) that the expression is equal to
export const recognize = (tree, defs) => {
  const normal = normalize(tree, defs);
  if (!normal) return [];
  const c = canonical(normal);
  if (!canonicalDefs.has(defs)) {
    const map = new Map();
    for (const [name, def] of defs) {
      const n = normalize(def, defs);
      if (n) map.set(name, canonical(n));
    }
    canonicalDefs.set(defs, map);
  }
  const names = [...canonicalDefs.get(defs)]
    .filter(([, d]) => d === c)
    .map(([name]) => name)
    .sort((a, b) => b.length - a.length); // TRUE before K
  const numeral = c.match(/^λλ((?:\(1 )*)0(\)*)$/);
  if (numeral && numeral[1].length / 3 === numeral[2].length) {
    names.push(String(numeral[2].length));
  }
  return names;
};

// Folding values back into names, so big terms stay readable: when part of a term turns out to be
// exactly something the program has a name for, like FACT or 2, it can be shown by that name.

// The terms worth recognizing, as a Map from canonical form to name: everything the program refers
// to (directly or through other definitions), as written and after each of its first few steps,
// plus small numbers if it uses any numbers. Anything that matches more than one name, like λab.b
// (FALSE or 0), is left out.
// The definitions a program depends on, directly or through other definitions, as a list of
// {name, term}, each after the ones it uses. Numbers are included, with their Church numerals.
export const definitionsUsed = (tree, defs) => {
  const used = [];
  const seen = new Set();
  const visit = (n) => {
    for (const name of refNames(n)) {
      if (seen.has(name)) continue;
      seen.add(name);
      const term = definition(name, defs);
      if (!term) continue;
      visit(term);
      used.push({name, term});
    }
  };
  visit(tree);
  return used;
};

// the names a program uses, directly or through other definitions
export const namesUsed = (tree, defs) =>
  new Set(definitionsUsed(tree, defs).map((d) => d.name));

export const knownValues = (tree, defs) => {
  const used = namesUsed(tree, defs);
  const candidates = new Map(); // canonical form -> names
  const add = (name, term) => {
    const c = canonical(term);
    const names = candidates.get(c) ?? [];
    if (!names.includes(name)) candidates.set(c, [...names, name]);
  };
  for (const name of used) {
    let term = defs.get(name);
    for (let i = 0; term && i < 5; i++) {
      // a name that's just another name isn't worth folding
      if (term.type !== 'ref') add(name, term);
      term = reduceStep(term, defs)?.result;
    }
  }
  if ([...used].some((name) => /^\d+$/.test(name))) {
    for (let i = 0; i <= 20; i++) add(String(i), numeral(i));
  }
  return new Map(
    [...candidates]
      .filter(([, names]) => names.length === 1)
      .map(([c, [name]]) => [c, name]),
  );
};

// ids of the nodes from the root of a term down to a node in it
const pathTo = (n, id) => {
  if (n.id === id) return [id];
  const children =
    n.type === 'lam' ? [n.body] : n.type === 'app' ? [n.fn, n.arg] : [];
  for (const child of children) {
    const path = pathTo(child, id);
    if (path) return [n.id, ...path];
  }
};

// Replaces each part of a term that's exactly a known term with its name. It leaves alone the
// whole term, anything that's about to be applied (it would just get unfolded again), and anything
// containing the next step. Returns the new term, and the folds: which node became which name.
export const foldValues = (tree, known) => {
  const next = findRedex(tree);
  const busy = new Set(next ? pathTo(tree, next.id) : []);
  const folds = [];
  const fold = (n, applied) => {
    if (n.type === 'var' || n.type === 'ref') return n;
    const name =
      !applied && n !== tree && !busy.has(n.id) && known.get(canonical(n));
    if (name) {
      const ref = mk({type: 'ref', name});
      folds.push({from: n, to: ref});
      return ref;
    }
    if (n.type === 'lam') {
      const body = fold(n.body, false);
      return body === n.body ? n : {...n, body};
    }
    const fn = fold(n.fn, true);
    const arg = fold(n.arg, false);
    return fn === n.fn && arg === n.arg ? n : {...n, fn, arg};
  };
  return {tree: fold(tree, false), folds};
};
