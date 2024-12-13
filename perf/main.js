const numWorkers = 32;
const numIterations = 1e5;

const workers = Array.from(
  {length: numWorkers},
  () => new Worker('./worker.js', {type: 'module'})
);

const run = () =>
  Promise.all(
    workers.map(
      (w) =>
        new Promise((resolve) => {
          w.onmessage = resolve;
          w.postMessage({iterations: numIterations});
        })
    )
  );

const median = (arr) => {
  arr.sort((a, b) => a - b);
  return arr.length % 2
    ? arr[Math.floor(arr.length / 2)]
    : (arr[arr.length / 2] + arr[arr.length / 2 - 1]) / 2;
};

const times = [];

const loop = async () => {
  const start = performance.now();
  await run();
  times.push(performance.now() - start);

  document.querySelector('#result').innerHTML =
    Math.round(median(times)) + 'ms';

  if (times.length < 1000) requestAnimationFrame(loop);
};

loop();
