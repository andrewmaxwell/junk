// Sends every line of a .scn file to the X32, changing the live mix to match it.
// Usage: node pushscene.mjs [scene.scn] [mixer IP]
import dgram from 'node:dgram';
import fs from 'node:fs';
const dir = import.meta.dirname;
const [, , file = `${dir}/master.scn`, host = '10.0.0.100'] = process.argv;
const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const osc = (str) =>
  Buffer.concat([
    pad(Buffer.from('/')),
    pad(Buffer.from(',s')),
    pad(Buffer.from(str, 'latin1')),
  ]);
const lines = fs
  .readFileSync(file, 'latin1')
  .split('\n')
  .slice(1)
  .filter((l) => l.startsWith('/'));
const s = dgram.createSocket('udp4');
let waiting = null;
// The X32 echoes each line it accepts.
s.on('message', (m) => {
  const str = m.toString('latin1');
  if (
    waiting &&
    str.startsWith('/\0') &&
    str.slice(8).replace(/\0+$/, '') === waiting.line
  )
    waiting.done();
});
const push = (line) =>
  new Promise((res) => {
    const t = setTimeout(() => {
      waiting = null;
      res(false);
    }, 300);
    waiting = {
      line,
      done: () => {
        clearTimeout(t);
        waiting = null;
        res(true);
      },
    };
    s.send(osc(line), 10023, host);
  });
s.bind(async () => {
  const failed = [];
  for (const line of lines) {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) ok = await push(line);
    if (!ok) failed.push(line);
  }
  console.log(`sent ${lines.length - failed.length}/${lines.length} lines`);
  if (failed.length) console.log('not confirmed:\n' + failed.join('\n'));
  s.close();
});
