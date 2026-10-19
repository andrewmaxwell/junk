import {makeCartogram} from './cartogram.js';

onmessage = ({data}) => {
  const summary = ({misplaced}) => ({misplaced});
  const result = makeCartogram(data, ({points, pass, error}) =>
    postMessage({type: 'progress', points, pass, error: summary(error)}),
  );
  postMessage({
    type: 'done',
    points: result.points,
    error: summary(result.error),
  });
};
