// Connection lifecycle: find the port, (re)connect, initialize, and on the
// first connect run the self-test and start preheating.

import {SerialPort} from 'serialport';
import {ReadlineParser} from '@serialport/parser-readline';
import fs from 'fs';
import {SIM, recipe} from './config.js';
import {s, resetReadings} from './state.js';
import {sleep} from './util.js';
import {parseMessage} from './protocol.js';
import {send} from './io.js';
import {FakePort} from './simulator.js';
import {runPreflight} from './preflight.js';
import {startPreheat} from './control.js';

async function findPort() {
  const ports = await SerialPort.list();
  const match = ports.find(
    (p) =>
      /usbmodem|usbserial|USB/i.test(p.path) ||
      /kaleido/i.test(p.manufacturer ?? ''),
  );
  if (!match) return null;
  let path = match.path;
  // macOS: SerialPort.list() reports the /dev/tty.* device, but opening that
  // blocks on carrier-detect and won't reliably do bidirectional I/O. Use the
  // matching /dev/cu.* callout device instead.
  if (process.platform === 'darwin' && path.includes('/tty.')) {
    const cu = path.replace('/tty.', '/cu.');
    if (fs.existsSync(cu)) path = cu;
  }
  return path;
}

function openPort(path) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path,
      baudRate: recipe.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    });
    port.open((err) => (err ? reject(err) : resolve(port)));
  });
}

// Ping until acknowledged, then set temperature unit and arm the start guard.
async function initialize() {
  while (s.sid === null && s.port?.isOpen) {
    send('PI');
    await sleep(SIM ? 100 : 1000);
  }
  send('TU', 'C');
  await sleep(300);
  send('SC', 'AR');
  await sleep(300);
}

// (Re)connect forever until the roast is finished or aborted. On the first
// successful connect we run the self-test and start preheating; on a later
// reconnect we just resume so an unplugged cable mid-roast isn't fatal.
export async function connectionManager() {
  while (s.phase !== 'DONE' && s.phase !== 'ABORTED') {
    if (s.port?.isOpen) {
      await sleep(500);
      continue;
    }
    let port;
    if (SIM) {
      port = new FakePort();
    } else {
      const path = await findPort();
      if (!path) {
        await sleep(1500);
        continue;
      }
      try {
        port = await openPort(path);
      } catch {
        await sleep(1500);
        continue;
      }
    }
    s.port = port;
    port.on('close', () => {
      if (s.port === port) s.port = null;
      resetReadings();
    });
    port.pipe(new ReadlineParser({delimiter: '\n'})).on('data', (line) => {
      parseMessage(line.trim());
    });
    await initialize();

    if (s.phase === 'CONNECTING') {
      const ok = recipe.preflight.enabled ? await runPreflight() : true;
      if (!ok) {
        s.phase = 'ABORTED';
        break;
      }
      startPreheat();
      s.phase = 'PREHEATING';
    }
  }
}
