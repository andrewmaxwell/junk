import {evaluate} from './evaluate.js';

self.onmessage = ({data: {id, value}}) => {
  const start = performance.now();
  const {result, steps} = evaluate(value);
  const time = (performance.now() - start).toFixed(1) + ' ms';
  self.postMessage({result, steps, time, id});
};
