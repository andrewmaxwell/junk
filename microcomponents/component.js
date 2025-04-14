import {parse} from './parse.js';

const resolveValues = (el, state) => {
  if (typeof el === 'function') return el(state);

  if (Array.isArray(el)) {
    return el.map((c) => resolveValues(c, state));
  }

  if (!el || typeof el !== 'object') return el;

  const newObj = {};
  for (const key in el) {
    newObj[key] = key.startsWith('on')
      ? el[key] // do not change event handlers
      : resolveValues(el[key], state);
  }
  if (el.children) {
    newObj.children = resolveValues(el.children, state).flat(Infinity);
  }
  return newObj;
};

export const component = (...templateArgs) => {
  const parsed = parse(...templateArgs);
  return (state) => resolveValues(parsed, state);
};
