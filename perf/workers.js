// Every worker script defines setup(arg) and run(durationMs). run returns
// { work, start, end, sanity } where start/end come from now(), which is
// comparable across workers.
const preamble = `
  const now = () => performance.timeOrigin + performance.now();
`;
const footer = `
  self.onmessage = (e) => {
    if ('setup' in e.data) {
      setup(e.data.setup);
      self.postMessage(null);
    } else {
      self.postMessage(run(e.data.durationMs));
    }
  };
`;

/** @param {string} body */
export function makeWorkerUrl(body) {
  const blob = new Blob([preamble, body, footer], {
    type: 'application/javascript',
  });
  return URL.createObjectURL(blob);
}

/** @param {Worker} worker @param {any} msg */
function ask(worker, msg) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.onerror = (e) => reject(new Error(e.message || 'Worker failed'));
    worker.postMessage(msg);
  });
}

/**
 * Sets up `count` workers, then starts them all at once so their timed runs
 * overlap. Returns total work per second of wall-clock time, from the first
 * worker starting to the last one finishing.
 * @param {string} url
 * @param {number} count
 * @param {any} setupArg
 * @param {number} durationMs
 */
export async function runParallel(url, count, setupArg, durationMs) {
  /** @type {Worker[]} */
  const workers = [];
  try {
    for (let i = 0; i < count; i++) workers.push(new Worker(url));
    await Promise.all(workers.map((w) => ask(w, {setup: setupArg})));
    const results = await Promise.all(
      workers.map((w) => ask(w, {durationMs})),
    );

    const start = Math.min(...results.map((r) => r.start));
    const end = Math.max(...results.map((r) => r.end));
    let work = 0;
    let sanity = 0;
    for (const r of results) {
      work += r.work;
      sanity += r.sanity;
    }
    return {perSecond: work / ((end - start) / 1000), sanity};
  } finally {
    for (const w of workers) w.terminate();
  }
}
