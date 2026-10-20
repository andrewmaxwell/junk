import {makeCartogram} from './cartogram.js';

onmessage = ({data}) => {
  // A quick coarse pass first, so a glide from another cartogram can start
  // right away instead of waiting for the full solve.
  if (data.preview) {
    const quick = makeCartogram({...data, passes: 1, res: 128}, () => {});
    postMessage({type: 'preview', ...quick});
  }
  const result = makeCartogram(data, (progress) =>
    postMessage({type: 'progress', ...progress}),
  );
  postMessage({type: 'done', ...result});
};
