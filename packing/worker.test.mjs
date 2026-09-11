// Execute the actual browser worker in a Node worker with a minimal self shim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { validateLayout } from './validate.js';

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
