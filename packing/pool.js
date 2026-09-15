// Parallel search: one independent solver per worker, each from its own seed,
// merged into the single state the page draws.
//
// Restarts are already the search's unit of independence -- nothing one
// attempt hands the next except the global best -- so extra cores are simply
// extra restarts in the same wall time. Workers never talk to each other; only
// the best layout across all of them is kept.
//
// Worker i runs seed `seed + i`, and only worker 0 starts from the aligned
// lattice. That opening is the same whatever the seed, so any other copy would
// mostly repeat its work.
//
// One worker at a time is *watched*: it streams its live layout for the
// current-search view, while the rest report less often and without one, which
// spares their loose-piece scans and the main thread's message load. When the
// watched worker finishes, the view hands over to one still running.

// Leave a core for the page itself. Past eight, message traffic and memory
// grow faster than the chance of a better packing.
export const poolSize = (cores = 2) => Math.max(1, Math.min(8, cores - 1));

const WORKER_FAILED = 'The search worker could not run. Serve this folder over HTTP and press Reset to retry.';
const MESSAGE_FAILED = 'The search update could not be read. Press Reset to retry.';

export class SearchPool {
  constructor({ size, createWorker, onUpdate, onError }) {
    this.size = size;
    this.createWorker = createWorker;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.workers = [];
    this.commandId = 0;
    this.seed = null;
    this.clear();
  }

  clear() {
    this.states = new Array(this.size).fill(null);
    this.seen = new Array(this.size).fill(0); // history entries already logged
    this.log = [];
    this.watched = 0;
    this.perfect = false;
    this.live = null;
  }

  spawn() {
    this.workers = Array.from({ length: this.size }, (_, index) => {
      const worker = this.createWorker();
      worker.onmessage = ({ data }) => this.receive(index, data);
      worker.onerror = (event) => {
        event.preventDefault?.();
        this.onError(WORKER_FAILED);
      };
      worker.onmessageerror = () => this.onError(MESSAGE_FAILED);
      return worker;
    });
  }

  reset(config, seed = (Math.random() * 2 ** 32) >>> 0) {
    if (!this.workers.length) this.spawn();
    this.clear();
    this.seed = seed >>> 0;
    this.commandId++;
    this.workers.forEach((worker, i) => worker.postMessage({
      type: 'reset', commandId: this.commandId, start: true, watched: i === 0,
      config: { ...config, seed: (this.seed + i) >>> 0, latticeStart: i === 0 },
    }));
  }

  play() { this.send('play'); }

  pause() { this.send('pause'); }

  send(type) {
    this.commandId++;
    for (const worker of this.workers) worker.postMessage({ type, commandId: this.commandId });
  }

  terminate() {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
  }

  receive(index, data) {
    // Ignore reports queued before the most recent reset/pause/play command.
    if (data.commandId !== this.commandId) return;
    if (data.type === 'error') {
      this.onError(data.message);
      return;
    }
    this.states[index] = data;
    // Attempts are logged in the order they are heard about, across workers.
    for (const entry of data.history.slice(this.seen[index])) this.log.push({ ...entry, worker: index });
    this.seen[index] = data.history.length;
    // A worker that has just been handed off may still have a live frame in flight.
    if (index === this.watched && data.live) this.live = data.live;

    // A packing at the area bound cannot be beaten by anyone; stop the rest.
    if (!this.perfect && data.best && data.best.scale <= data.lowerBound) {
      this.perfect = true;
      this.send('pause');
    }
    if (index === this.watched && data.done) this.handOver();
    this.onUpdate(this.state);
  }

  handOver() {
    const next = this.states.findIndex((s) => !s?.done);
    if (next < 0) return;
    this.watched = next;
    this.workers[next].postMessage({ type: 'watch', commandId: this.commandId, on: true });
  }

  // Everything the page shows, in one object. Progress counters are summed over
  // workers; the probe details come from the watched one.
  get state() {
    const reported = this.states.filter(Boolean);
    if (!reported.length) return null;
    const sum = (key) => reported.reduce((total, s) => total + s[key], 0);
    let holder = null;
    for (const s of reported) {
      if (s.best && (!holder || s.best.scale < holder.best.scale)) holder = s;
    }
    const best = holder?.best ?? null;
    const done = this.perfect || (reported.length === this.size && reported.every((s) => s.done));
    const watched = this.states[this.watched] ?? reported[0];
    return {
      done,
      running: !done && reported.some((s) => s.running),
      seed: this.seed,
      workers: this.size,
      watched: this.watched,
      attemptsDone: sum('attemptIndex'),
      attemptsTotal: this.size * reported[0].config.attempts,
      scale: watched.scale,
      attemptBestScale: watched.attemptBestScale,
      temperature: watched.temperature,
      best,
      efficiency: holder?.efficiency ?? null,
      // Once the search is over, the live view shows the overall winner.
      live: done && best ? finalView(best) : this.live,
      history: this.log,
      elapsedMs: sum('elapsedMs'),
      iterations: sum('iterations'),
      hops: sum('hops'),
      acceptedHops: sum('acceptedHops'),
    };
  }
}

// Every piece of a best layout is feasible by construction.
const finalView = (best) => ({
  container: best.container,
  items: best.items,
  final: true,
  settled: best.items.map(() => true),
  loose: best.loose,
});
