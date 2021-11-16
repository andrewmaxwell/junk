import {astToString} from './astToString.js';
import {parse, tokenize} from './parse.js';

const deepEq = (a, b) =>
  a === b || Object.keys({...a, ...b}).every((_, i) => deepEq(a[i], b[i]));

const removeFalsyValus = (ob) => {
  const res = {};
  for (const key in ob) {
    if (ob[key]) res[key] = ob[key];
  }
  return res;
};

const divide = ({left: lv, right: lu}, {left: rv, right: ru}) => ({
  op: 'val',
  left: lv / rv,
  right: Object.keys({...lu, ...ru}).reduce((res, key) => {
    res[key] = (lu[key] || 0) - (ru[key] || 0);
    return res;
  }, {}),
});

const multiply = ({left: lv, right: lu}, {left: rv, right: ru}) => ({
  op: 'val',
  left: lv * rv,
  right: Object.keys({...lu, ...ru}).reduce((res, key) => {
    res[key] = (lu[key] || 0) + (ru[key] || 0);
    return res;
  }, {}),
});

const add = ({left: lv, right: lu}, {left: rv, right: ru}) => ({
  op: 'val',
  left: lv + rv,
  right: deepEq(removeFalsyValus(lu), removeFalsyValus(ru)) ? lu : '???',
});

const negate = (ob) => ({...ob, left: -ob.left});

const exp = ({left: lv, right: lu}, rv) => ({
  op: 'val',
  left: lv ** rv,
  right: Object.keys(lu).reduce(
    (res, key) => ({...res, [key]: (lu[key] || 0) * rv}),
    []
  ),
});

const simplifyVal = (left, right, conversions) =>
  right.reduce(
    (result, u) => {
      const m = u.match?.(/^([a-z_]+)(\d*)$/);
      if (!m)
        throw new Error(
          `Unrecognizable unit: "${u}", try one of the examples below.`
        );

      const unit = m[1];
      const exponent = Number(m[2] || 1);

      if (conversions[unit])
        return multiply(result, exp(conversions[unit], exponent));

      result.right[unit] = (result.right[unit] || 0) + exponent;
      return result;
    },
    {op: 'val', left, right: {}}
  );

const simplify = (ast = {}, conversions) => {
  const {op, left, right} = ast;
  switch (op) {
    case 'to':
      return divide(simplify(left, conversions), simplify(right, conversions));
    case '/':
      return divide(simplify(left, conversions), simplify(right, conversions));
    case '*':
      return multiply(
        simplify(left, conversions),
        simplify(right, conversions)
      );
    case '+':
      return add(simplify(left, conversions), simplify(right, conversions));
    case '-':
      return add(
        simplify(left, conversions),
        negate(simplify(right, conversions))
      );
    case '^':
      return exp(
        simplify(left, conversions),
        simplify(right, conversions).left
      );
    case 'val': {
      return simplifyVal(left, right, conversions);
    }
  }
};

export const solve = (input, conversions) => {
  const tokens = tokenize(input);
  const parsed = parse(tokens);
  const simplified = simplify(parsed, conversions);
  return {
    tokens,
    parsed,
    simplified,
    solution: astToString(simplified),
  };
};
