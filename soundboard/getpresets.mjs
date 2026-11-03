// Saves every channel preset in the X32's library as presets/NNN-Name.chn, where NNN is the library slot.
// The board can't send a preset's settings directly, so each one is loaded onto unused ch 26 and read back.
// Ch 26 and its input jack (26) are blanked from master.scn before each load and after the last.
// Usage: node getpresets.mjs [mixer IP]
import dgram from 'node:dgram';
import fs from 'node:fs';
const dir = import.meta.dirname;
const [, , host = '10.0.0.100'] = process.argv;
const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const int = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const msg = (addr, types, ...args) =>
  Buffer.concat([
    pad(Buffer.from(addr)),
    pad(Buffer.from(types)),
    ...args.map((a) =>
      typeof a === 'number' ? int(a) : pad(Buffer.from(a, 'latin1')),
    ),
  ]);
// The lines a .chn file holds, in order, as they appear on ch 26.
const sections = [
  'config',
  'delay',
  'preamp',
  'gate',
  'gate/filter',
  'dyn',
  'dyn/filter',
  'eq',
  'eq/1',
  'eq/2',
  'eq/3',
  'eq/4',
  'mix',
  ...Array.from(
    {length: 16},
    (_, i) => `mix/${String(i + 1).padStart(2, '0')}`,
  ),
];
const blank = fs
  .readFileSync(`${dir}/master.scn`, 'latin1')
  .split('\n')
  .filter((l) => l.startsWith('/ch/26/') || l.startsWith('/headamp/025 '));

const s = dgram.createSocket('udp4');
let waiting = null;
s.on('message', (m) => {
  const str = m.toString('latin1');
  if (!str.startsWith('node')) return;
  const line = str.slice(12).replace(/\0+$/, '').replace(/\n$/, '');
  if (waiting && line.startsWith(waiting.key + ' ')) waiting.done(line);
});
const ask = (p) =>
  new Promise((res, rej) => {
    let tries = 0;
    const send = () => {
      if (tries++ === 4) return rej(new Error(`no reply for ${p}`));
      s.send(msg('/node', ',s', p.slice(1)), 10023, host);
      waiting.t = setTimeout(send, 300);
    };
    waiting = {
      key: p,
      done: (line) => {
        clearTimeout(waiting.t);
        waiting = null;
        res(line);
      },
    };
    send();
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const setLines = async (lines) => {
  for (const l of lines) s.send(msg('/', ',s', l), 10023, host);
  await wait(200);
};

s.bind(async () => {
  for (const f of fs.readdirSync(`${dir}/presets`))
    if (f.endsWith('.chn')) fs.unlinkSync(`${dir}/presets/${f}`);
  let count = 0;
  for (let n = 1; n <= 100; n++) {
    const slot = String(n).padStart(3, '0');
    // e.g. /-libs/ch/037 37 "Bass" 0 %0011111100110100 1
    const info = (await ask(`/-libs/ch/${slot}`)).slice(
      `/-libs/ch/${slot} `.length,
    );
    const name = info.match(/"([^"]*)"/)[1];
    if (!name) continue;
    await setLines(blank);
    s.send(msg('/load', ',siii', 'libchan', n - 1, 25, 255), 10023, host);
    await wait(300);
    const lines = [];
    for (const sec of sections)
      lines.push((await ask(`/ch/26/${sec}`)).slice('/ch/26'.length));
    // config's last field is the channel's source, which presets don't hold
    lines[0] = lines[0].replace(/ \d+$/, '');
    // The gain always loads, whatever the flags say. It lands on ch 26's jack, so files say /headamp/025.
    lines.push(await ask('/headamp/025'));
    fs.writeFileSync(
      `${dir}/presets/${slot}-${name.replace(/[/\\:]/g, '_')}.chn`,
      [`#4.0# ${info}`, ...lines].join('\n') + '\n',
      'latin1',
    );
    count++;
  }
  await setLines(blank);
  console.log(`saved ${count} presets`);
  s.close();
});
