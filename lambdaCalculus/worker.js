import {evaluate} from './evaluate.js';

self.onmessage = ({data}) => {
  const start = performance.now();
  const result = evaluate(data);
  const time = (performance.now() - start).toFixed(1) + ' ms';
  self.postMessage({result, time});
};
