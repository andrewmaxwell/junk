import {makeCartogram} from './cartogram.js';

onmessage = ({data}) => {
  const summary = ({misplaced}) => ({misplaced});
  // A quick coarse pass first, so a glide from another cartogram can start
  // right away instead of waiting for the full solve.
  if (data.preview) {
    const quick = makeCartogram({...data, passes: 1, res: 128}, () => {});
    postMessage({
      type: 'preview',
      points: quick.points,
      error: summary(quick.error),
    });
  }
  const result = makeCartogram(data, ({points, pass, error, passDone}) =>
    postMessage({
      type: 'progress',
      points,
      pass,
      passDone,
      error: summary(error),
    }),
  );
  postMessage({
    type: 'done',
    points: result.points,
    error: summary(result.error),
    converged: result.converged,
  });
};
