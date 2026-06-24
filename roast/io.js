// Serial write layer. The M1 drops commands sent back-to-back, so every write
// goes through a queue that spaces them out. Without this a burst like the
// all-off shutdown loses commands (e.g. the drum never stops).

import {SIM} from './config.js';
import {s} from './state.js';
import {sleep} from './util.js';
import {createMsg} from './protocol.js';

const WRITE_GAP = SIM ? 5 : 100; // ms between serial writes
const queue = [];
let draining = false;

export function send(tag, value) {
  if (!s.port?.isOpen) return;
  queue.push(createMsg(tag, value));
  drain();
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const msg = queue.shift();
    if (s.port?.isOpen) {
      try {
        s.port.write(msg);
      } catch {
        /* ignore */
      }
    }
    await sleep(WRITE_GAP);
  }
  draining = false;
}

// Resolve once every queued write has been sent (used before closing the port).
export async function flushWrites() {
  while (queue.length || draining) await sleep(20);
}
