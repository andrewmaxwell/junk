// Keeps the roaster in the state we want, over a connection that drops
// commands and sometimes drops entirely.
//
// Nobody sends control commands directly. Callers set the desired value of
// each control (machine.set({HP: 45})), and the reconciler resends anything
// the machine hasn't echoed back, every poll, until it matches. It also
// enforces the order the Kaleido needs when switching to manual:
//   TS first (the setpoint caps the burner even in manual mode),
//   then AH 0, and only then HP (in auto mode HP is the PID's, not ours).
//
// Events: 'connected', 'disconnected', 'sample' (every RD reply, with all the
// current readings), 'stuck' (a control hasn't matched for stuckMs), 'error'.

import {EventEmitter} from 'events';
import {encode, parse} from './protocol.js';

export const CONTROLS = ['TS', 'HS', 'AH', 'FC', 'RC', 'CS', 'HP'];

// The M1 LITE silently clamps the setpoint: asked for TS 250 it sets and
// echoes 240 (self-test, 2026-10-04). Clamp here, or the reconciler would
// chase a value the machine will never report, and AH 0 (which waits for TS)
// would never be sent.
export const MAX_TS = 240;

export class Machine extends EventEmitter {
  constructor({
    openTransport,
    clock,
    pollMs = 1500,
    writeGapMs = 100, // the M1 drops commands sent back-to-back
    silenceMs = 5000, // no reply for this long = connection is dead
    retryMs = 1000, // wait before reconnecting
    stuckMs = 8000,
  }) {
    super();
    Object.assign(this, {
      openTransport,
      clock,
      pollMs,
      writeGapMs,
      silenceMs,
      retryMs,
      stuckMs,
    });
    this.state = {}; // last values the machine reported
    this.desired = {}; // what we want the controls to be
    this.connected = false;
    this.lastSent = {};
    this.mismatchSince = {};
    this.queue = new Map(); // tag -> value; one pending write per tag
    this.sent = {}; // commands written per tag (resends included)
    this.stopped = false;
  }

  // Merge into the desired state and push the changes out right away.
  set(values) {
    for (let [k, v] of Object.entries(values)) {
      if (!CONTROLS.includes(k)) throw new Error(`unknown control ${k}`);
      if (k === 'TS') v = Math.min(v, MAX_TS);
      if (this.desired[k] !== v) {
        this.desired[k] = v;
        delete this.lastSent[k];
        delete this.mismatchSince[k];
      }
    }
    this.reconcile();
  }

  // Event markers shown on the machine's display. Best effort, not reconciled.
  event(code) {
    this.enqueue('EV', code);
  }

  matches(k) {
    const want = this.desired[k];
    const got = this.state[k];
    if (got == null) return false;
    return k === 'TS' ? Math.abs(got - want) < 0.6 : got === want;
  }

  // True once every desired control (that we're responsible for) matches,
  // or just the given ones.
  settled(keys = CONTROLS) {
    return keys.every(
      (k) => this.desired[k] == null || !this.owns(k) || this.matches(k),
    );
  }

  // HP belongs to the machine's PID unless we're in manual mode.
  owns(k) {
    return k !== 'HP' || this.desired.AH === 0;
  }

  reconcile() {
    if (!this.connected) return;
    const now = this.clock.now();
    for (const k of CONTROLS) {
      if (this.desired[k] == null || !this.owns(k)) continue;
      if (this.matches(k)) {
        delete this.mismatchSince[k];
        continue;
      }
      if (k === 'AH' && this.desired.TS != null && !this.matches('TS'))
        continue;
      if (k === 'HP' && this.state.AH !== 0) continue;
      this.mismatchSince[k] ??= now;
      if (now - this.mismatchSince[k] > this.stuckMs) {
        this.emit('stuck', {
          control: k,
          want: this.desired[k],
          got: this.state[k],
        });
        this.mismatchSince[k] = now; // report again after another stuckMs
      }
      if (this.lastSent[k] == null || now - this.lastSent[k] >= this.pollMs) {
        this.lastSent[k] = now;
        this.enqueue(k, this.desired[k]);
      }
    }
  }

  enqueue(tag, value) {
    // A tag that's already waiting gets the new value but keeps its place.
    // (Moving it to the back starved the RD poll whenever commands arrived
    // faster than the write gap drains them: no readings, ever.)
    this.queue.set(tag, value);
    this.drain();
  }

  async drain() {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.size && this.transport?.isOpen) {
      const [tag, value] = this.queue.entries().next().value;
      this.queue.delete(tag);
      try {
        this.transport.write(encode(tag, value));
        this.sent[tag] = (this.sent[tag] ?? 0) + 1;
      } catch (err) {
        this.emit('error', err);
      }
      await this.clock.sleep(this.writeGapMs);
    }
    this.draining = false;
  }

  onLine(line) {
    const msg = parse(line);
    if (!msg) return;
    this.lastRx = this.clock.now();
    Object.assign(this.state, {sid: msg.sid}, msg.vars);
    if ('BT' in msg.vars) this.emit('sample', {t: this.lastRx, ...this.state});
    this.reconcile();
  }

  // Ping until the machine answers, then set Celsius and the start guard
  // (the same handshake Artisan does).
  async handshake() {
    const deadline = this.clock.now() + this.silenceMs * 2;
    while (this.state.sid == null) {
      if (this.clock.now() > deadline) throw new Error('No answer to ping');
      this.transport.write(encode('PI'));
      await this.clock.sleep(1000);
    }
    this.enqueue('TU', 'C');
    this.enqueue('SC', 'AR');
  }

  // Connect, keep the machine in the desired state, and reconnect forever
  // until stop(). After a reconnect the reconciler simply re-applies the
  // desired state, so an unplugged cable mid-roast isn't fatal.
  async run() {
    while (!this.stopped) {
      try {
        this.transport = await this.openTransport();
        const closed = new Promise((r) => this.transport.once('close', r));
        let isClosed = false;
        closed.then(() => (isClosed = true));
        this.transport.on('line', (l) => this.onLine(l));
        this.transport.on('error', (e) => this.emit('error', e));
        this.lastRx = this.clock.now();
        await this.handshake();
        this.connected = true;
        this.emit('connected');
        this.reconcile();
        while (!this.stopped && !isClosed) {
          if (this.clock.now() - this.lastRx > this.silenceMs)
            throw new Error('Roaster stopped answering');
          this.enqueue('RD', 'A0');
          await this.clock.sleep(this.pollMs);
        }
      } catch (err) {
        if (!this.stopped) this.emit('error', err);
      }
      this.teardown();
      if (!this.stopped) await this.clock.sleep(this.retryMs);
    }
  }

  teardown() {
    const t = this.transport;
    this.transport = null;
    this.queue.clear();
    if (t) {
      t.removeAllListeners('line');
      t.removeAllListeners('error');
      t.close();
    }
    // Readings from a dead connection must never be trusted.
    this.state = {};
    this.lastSent = {};
    this.mismatchSince = {};
    if (this.connected) {
      this.connected = false;
      this.emit('disconnected');
    }
  }

  // Ends the safety guard and closes the port. Turning things off first is
  // the session's job (it sets the desired state and waits for settled()).
  async stop() {
    this.stopped = true;
    if (this.transport?.isOpen) {
      this.enqueue('CL', 'AR');
      await this.clock.sleep(this.writeGapMs * 3);
    }
    this.teardown();
  }
}
