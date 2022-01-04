import {parseFacts} from './parseFacts';
import {inspect} from 'util';

// http://web.cse.ohio-state.edu/~stiff.4/cse3521/prolog-examples.html

const isPlaceholder = (str) => str && str[0] === str[0].toUpperCase();

const log = (ob) => console.log(inspect(ob, {depth: null, colors: true}));

const removeExtraProps = (ob) =>
  Object.fromEntries(Object.entries(ob).filter((p) => p[0][0] !== '_'));

const uniq = (arr) => {
  const seen = new Set();
  return arr.filter((el) => {
    const key = JSON.stringify(el);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const propsInCommonAreEqual = (a, b) =>
  Object.keys({...a, ...b}).every(
    (k) => a[k] === undefined || b[k] === undefined || a[k] === b[k]
  );

const ops = {
  '\\=': (a, b) => a && a !== b,
};
const checkOp = (m, op, [a, b]) => op(m[a], b) || op(m[b], a);

const combine = (a, b) => {
  if (!a.length) return b;
  const result = [];
  for (const m of a) {
    for (const n of b) {
      if (n.op) {
        if (checkOp(m, ops[n.op], n.args)) {
          result.push(m);
        }
      } else if (m.op) {
        if (checkOp(n, ops[m.op], m.args)) {
          result.push(n);
        }
      } else if (propsInCommonAreEqual(m, n)) result.push({...m, ...n});
    }
  }
  log({a, b, result});
  return result;
};

const conditionResults = (facts, query, fact, depth) => {
  let result = [];
  for (const cond of fact.conditions) {
    // eslint-disable-next-line no-use-before-define
    const r = getAnswer(
      facts,
      {
        ...cond,
        args: cond.args.map(
          (a) => query.args[fact.args.indexOf(a)] || '_' + a + depth
        ),
      },
      depth + 1
    );
    if (!r.length) return [];
    result = combine(result, r);
  }
  return result;
};

const getMatch = (fact, query) => {
  const obj = {};
  for (let i = 0; i < query.args.length; i++) {
    const a = query.args[i];
    if (isPlaceholder(a)) obj[a] = fact.args[i];
    else if (a !== fact.args[i]) return false;
  }
  return obj;
};

const getAnswer = (facts, query, depth = 0) => {
  console.log('getAnswer', query);

  if (depth > 3) return [];

  let result;
  if (query.op) {
    if (query.args.some(isPlaceholder)) result = [query];
    else result = query.args[0] === query.args[1] ? [] : [{}];
  } else {
    result = [];
    for (const fact of facts) {
      if (fact.pred !== query.pred) continue;
      if (fact.conditions) {
        result = combine(result, conditionResults(facts, query, fact, depth));
      } else {
        const m = getMatch(fact, query);
        if (m) result.push(m);
      }
    }
  }

  log({query, result});
  return result;
};

export const prolog = (facts) => {
  const parsedFacts = parseFacts(facts);
  return (query) => {
    const parsedQuery = parseFacts(query)[0];
    const result = getAnswer(parsedFacts, parsedQuery);
    return parsedQuery.args.some(isPlaceholder)
      ? uniq(result.map(removeExtraProps))
      : result.length > 0;
  };
};
