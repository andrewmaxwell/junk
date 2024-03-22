import {parse} from './parse.js';
import {execute} from './execute.js';

const formatOutput = (val) =>
  Array.isArray(val) ? `(${val.map(formatOutput).join(' ')})` : val;

const evaluate = (str) => {
  try {
    return formatOutput(execute(parse(str)).result);
  } catch (e) {
    return e.message;
  }
};

self.onmessage = ({data}) => {
  const start = performance.now();
  const result = evaluate(data);
  const time = (performance.now() - start).toFixed(1) + ' ms';
  self.postMessage({result, time});
};
