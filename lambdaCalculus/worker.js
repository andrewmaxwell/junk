import {evaluate} from './evaluate.js';

self.onmessage = ({data}) => {
  const start = performance.now();
  const {result, steps} = evaluate(data);
  const time = (performance.now() - start).toFixed(1) + ' ms';
  self.postMessage({result, steps, time});
};
