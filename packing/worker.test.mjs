// Execute the actual browser worker in a Node worker with a minimal self shim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { validateLayout } from './validate.js';
import { SearchPool, poolSize } from './pool.js';

function spawnWorker() {
  const url = new URL('./worker.js', import.meta.url).href;
  return new Worker(`
    const { parentPort } = require('node:worker_threads');
    global.self = { postMessage: (data) => parentPort.postMessage(data) };
    import(${JSON.stringify(url)}).then(() => {
      parentPort.on('message', (data) => self.onmessage({data}));
      parentPort.postMessage({type:'ready'});
    });
  `, { eval: true });
}
function receive(worker, predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Worker response timed out')); }, timeout);
    const onError = (error) => { cleanup(); reject(error); };
    const onMessage = (data) => {
      if (data.type === 'error') onError(new Error(data.message));
      else if (predicate(data)) { cleanup(); resolve(data); }
    };
    function cleanup() { clearTimeout(timer); worker.off('message', onMessage); worker.off('error', onError); }
    worker.on('message', onMessage);
    worker.on('error', onError);
  });
}
async function command(worker, data, predicate = (s) => s.commandId === data.commandId) {
  const result = receive(worker, predicate);
  worker.postMessage(data);
  return result;
}

test('worker publishes bests, pauses, resumes, resets, and ignores canceled timers', async (t) => {
  const worker = spawnWorker();
  t.after(() => worker.terminate());
  await receive(worker, (s) => s.type === 'ready');
  const initial = await command(worker, { type: 'reset', commandId: 1,
    config: { seed: 42, count: 12, attempts: 20 } });
  assert.equal(initial.running, false);
  assert.equal(initial.efficiency, null);
  const progressing = receive(worker, (s) => s.commandId === 2 && s.best);
  worker.postMessage({ type: 'play', commandId: 2 });
  const progress = await progressing;
  assert.ok(validateLayout(progress.best.items, progress.best.container, progress.config.feasibleTolerance).ok);
  const pause = await command(worker, { type: 'pause', commandId: 3 });
  assert.equal(pause.running, false);
  const again = await command(worker, { type: 'pause', commandId: 4 });
  assert.equal(again.iterations, pause.iterations);
  const resumed = await command(worker, { type: 'play', commandId: 5 });
  assert.equal(resumed.running, true);
  assert.equal(resumed.seed, 42);
  const reset = await command(worker, { type: 'reset', commandId: 6,
    config: { seed: 9, itemShape: 'circle', count: 3, attempts: 1, iterationsPerAttempt: 30 }, start: true });
  assert.equal(reset.iterations, 0);
  assert.equal(reset.best, null);
  assert.equal(reset.seed, 9);
  const done = await receive(worker, (s) => s.commandId === 6 && s.done);
  assert.equal(done.running, false);
  assert.ok(done.best);
  assert.equal(done.live.final, true);
  assert.equal(done.live.container.R, done.best.container.R);
  assert.ok(done.live.settled.every(Boolean));
});

// The browser Worker interface (onmessage/postMessage/terminate) over the Node
// worker above, holding messages until the module has loaded.
function browserLikeWorker() {
  const worker = spawnWorker();
  const queue = [];
  let ready = false;
  const adapter = {
    onmessage: null,
    onerror: null,
    postMessage: (data) => (ready ? worker.postMessage(data) : queue.push(data)),
    terminate: () => worker.terminate(),
  };
  worker.on('message', (data) => {
    if (data.type !== 'ready') { adapter.onmessage?.({ data }); return; }
    ready = true;
    for (const data of queue.splice(0)) worker.postMessage(data);
  });
  worker.on('error', (error) => adapter.onerror?.(error));
  return adapter;
}

function realPool(size) {
  let waiting = [];
  const pool = new SearchPool({
    size,
    createWorker: browserLikeWorker,
    onUpdate: (state) => {
      waiting = waiting.filter(({ predicate, resolve }) => !(predicate(state) && (resolve(state), true)));
    },
    onError: (message) => { for (const { reject } of waiting) reject(new Error(message)); },
  });
  const until = (predicate, timeout = 20000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Pool update timed out')), timeout);
    waiting.push({
      predicate,
      resolve: (state) => { clearTimeout(timer); resolve(state); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
  });
  return { pool, until };
}

test('pool size leaves a core for the page and stays within bounds', () => {
  assert.equal(poolSize(1), 1);
  assert.equal(poolSize(undefined), 1);
  assert.equal(poolSize(4), 3);
  assert.equal(poolSize(64), 8);
});

test('pool seeds workers apart, hands over the live view, and ignores stale reports', () => {
  const sent = [];
  const pool = new SearchPool({
    size: 3,
    createWorker: () => {
      const worker = { postMessage: (data) => sent.push({ worker, data }), terminate() {} };
      return worker;
    },
    onUpdate() {},
    onError: (message) => { throw new Error(message); },
  });
  pool.reset({ attempts: 1 }, 7);
  const resets = sent.map(({ data }) => data.config);
  assert.deepEqual(resets.map((c) => c.seed), [7, 8, 9]);
  assert.deepEqual(resets.map((c) => c.latticeStart), [true, false, false]);

  const report = (index, extra = {}) => pool.receive(index, {
    type: 'state', commandId: pool.commandId, running: true, done: false, config: { attempts: 1 },
    history: [], attemptIndex: 0, elapsedMs: 1, iterations: 10, hops: 0, acceptedHops: 0,
    best: null, live: null, lowerBound: 1, ...extra,
  });
  const liveFrame = { items: [] };
  report(0, { live: liveFrame });
  report(1);
  report(2);
  assert.equal(pool.state.live, liveFrame);
  assert.equal(pool.state.iterations, 30);

  const entry = { attempt: 1, scale: 2, polish: false };
  report(0, { done: true, running: false, attemptIndex: 1, history: [entry], best: { scale: 2, items: [] } });
  assert.equal(pool.watched, 1);
  assert.equal(sent.at(-1).worker, pool.workers[1]);
  assert.deepEqual(sent.at(-1).data, { type: 'watch', commandId: pool.commandId, on: true });
  report(0, { done: true, running: false, attemptIndex: 1, history: [entry], live: { items: ['late'] } });
  assert.equal(pool.state.live, liveFrame, 'a handed-off worker cannot overwrite the view');
  assert.deepEqual(pool.state.history, [{ ...entry, worker: 0 }], 'each entry is logged once');
  assert.equal(pool.state.done, false);

  pool.receive(2, { type: 'state', commandId: pool.commandId - 1, done: true });
  assert.equal(pool.states[2].done, false, 'reports from an earlier command are ignored');
});

test('a pool of real workers merges their bests into one finished search', async (t) => {
  const { pool, until } = realPool(3);
  t.after(() => pool.terminate());
  pool.reset({ itemShape: 'circle', containerShape: 'circle', count: 6, attempts: 2,
    iterationsPerAttempt: 400, polishIterations: 200 }, 100);

  const early = await until(() => pool.states[1] && pool.states[0]);
  assert.equal(pool.states[1].live, null, 'unwatched workers send no live layout');
  assert.ok(early.live, 'the watched worker does');

  const done = await until((s) => s.done);
  assert.deepEqual(pool.states.map((s) => s.seed), [100, 101, 102]);
  const bests = pool.states.map((s) => s.best.scale);
  assert.equal(done.best.scale, Math.min(...bests));
  assert.ok(validateLayout(done.best.items, done.best.container, pool.states[0].config.feasibleTolerance).ok);
  assert.equal(done.attemptsDone, done.attemptsTotal);
  assert.equal(new Set(done.history.map((h) => h.worker)).size, 3);
  assert.equal(done.history.length, pool.states.reduce((n, s) => n + s.history.length, 0));
  assert.equal(done.live.final, true);
  assert.equal(done.live.items, done.best.items);
});

test('a pool stops every worker once one reaches the area bound', async (t) => {
  const { pool, until } = realPool(3);
  t.after(() => pool.terminate());
  pool.reset({ itemShape: 'square', containerShape: 'rect', count: 9, attempts: 50 }, 5);
  const done = await until((s) => s.done);
  assert.equal(done.best.scale, pool.states[0].lowerBound);
  assert.equal(done.running, false);
  assert.ok(done.attemptsDone < done.attemptsTotal, 'the rest did not run out their budget');
  await until(() => pool.states.every((s) => s.commandId === pool.commandId && !s.running));
});
