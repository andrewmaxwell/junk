// Saves the X32's live state as a .scn file by asking for every line the reference scene has.
// Usage: node getscene.mjs [reference.scn] [output.scn] [mixer IP]
import dgram from 'node:dgram';
import fs from 'node:fs';
const dir = import.meta.dirname;
const [
  ,
  ,
  ref = `${dir}/master.scn`,
  out = `${dir}/current.scn`,
  host = '10.0.0.100',
] = process.argv;
const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const osc = (addr, str) =>
  Buffer.concat([
    pad(Buffer.from(addr)),
    pad(Buffer.from(',s')),
    pad(Buffer.from(str, 'latin1')),
  ]);
const lines = fs.readFileSync(ref, 'latin1').split('\n');
const paths = lines
  .slice(1)
  .filter((l) => l.startsWith('/'))
  .map((l) => l.split(' ')[0]);
const s = dgram.createSocket('udp4');
const results = new Map();
let waiting = null;
s.on('message', (m) => {
  const str = m.toString('latin1');
  if (!str.startsWith('node')) return;
  const line = str.slice(12).replace(/\0+$/, '').replace(/\n$/, '');
  const key = line.split(' ')[0];
  results.set(key, line);
  if (waiting && waiting.key === key) waiting.done();
});
const ask = (p) =>
  new Promise((res) => {
    const t = setTimeout(() => {
      waiting = null;
      res(false);
    }, 300);
    waiting = {
      key: p,
      done: () => {
        clearTimeout(t);
        waiting = null;
        res(true);
      },
    };
    s.send(osc('/node', p.slice(1)), 10023, host);
  });
s.bind(async () => {
  const missing = [];
  for (const p of paths) {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) ok = await ask(p);
    if (!ok) missing.push(p);
  }
  const header = lines[0].replace(/^(#[^#]*#) "[^"]*"/, '$1 "current"');
  fs.writeFileSync(
    out,
    [
      header,
      ...paths.filter((p) => results.has(p)).map((p) => results.get(p)),
    ].join('\n') + '\n',
    'latin1',
  );
  console.log(
    `wrote ${results.size}/${paths.length} lines; missing: ${missing.join(' ') || 'none'}`,
  );
  s.close();
});
