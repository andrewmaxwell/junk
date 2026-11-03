// Writes presets/NNN-Name.chn files into the X32's channel library, each into slot NNN.
// Each file is set up on unused ch 26, saved, given the file's flags, then loaded back and checked.
// Ch 26 and its input jack (26) are blanked from master.scn before each step and after the last.
// Usage: node putpresets.mjs presets/048-Mark\ Bass.chn [...]
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
const dir = import.meta.dirname;
const host = '10.0.0.100';
const files = process.argv.slice(2);
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
const blank = fs
  .readFileSync(`${dir}/master.scn`, 'latin1')
  .split('\n')
  .filter((l) => l.startsWith('/ch/26/') || l.startsWith('/headamp/025 '));
// .chn lines become ch 26 lines; the gain goes to ch 26's jack.
const onCh26 = (l) =>
  l.startsWith('/headamp/')
    ? l.replace(/^\/headamp\/\d+/, '/headamp/025')
    : '/ch/26' + l;

const s = dgram.createSocket('udp4');
const replies = new Map();
s.on('message', (m) => {
  const str = m.toString('latin1');
  if (str.startsWith('node')) {
    const line = str.slice(12).replace(/\0+$/, '').replace(/\n$/, '');
    replies.set(line.split(' ')[0], line);
  } else if (str.startsWith('/save'))
    replies.set('/save', m.readInt32BE(m.length - 4));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (...a) => s.send(msg(...a), 10023, host);
const setLines = async (lines) => {
  for (const l of lines) send('/', ',s', l);
  await wait(200);
};
const read = async (keys) => {
  replies.clear();
  for (let i = 0; i < 3 && keys.some((k) => !replies.has(k)); i++)
    for (const k of keys.filter((k) => !replies.has(k))) {
      send('/node', ',s', k.slice(1));
      await wait(10);
    }
  await wait(300);
  return keys.map((k) => replies.get(k));
};

s.bind(async () => {
  for (const f of files) {
    const slot = path.basename(f).match(/^(\d{3})-/)[1];
    const [header, ...lines] = fs
      .readFileSync(f, 'latin1')
      .split('\n')
      .filter((l) => l.startsWith('/') || l.startsWith('#'));
    const name = header.match(/"([^"]*)"/)[1];
    const flags = parseInt(header.match(/%([01]+)/)[1], 2);
    await setLines(blank);
    await setLines(lines.map(onCh26));
    replies.delete('/save');
    send('/save', ',sisi', 'libchan', +slot - 1, name, 25);
    await wait(500);
    if (replies.get('/save') !== 1) {
      console.log(`${f}: save failed`);
      continue;
    }
    send(`/-libs/ch/${slot}/flags`, ',i', flags);
    await setLines(blank);
    send('/load', ',siii', 'libchan', +slot - 1, 25, 255);
    await wait(300);
    const want = lines.map(onCh26);
    const got = await read(want.map((l) => l.split(' ')[0]));
    // config's last field on the channel is its source, which presets don't hold
    const bad = want.filter(
      (l, i) =>
        (l.startsWith('/ch/26/config ')
          ? got[i]?.replace(/ \d+$/, '')
          : got[i]) !== l,
    );
    const [info] = await read([`/-libs/ch/${slot}`]);
    if (
      !info?.includes(`"${name}"`) ||
      !info.includes(header.match(/%[01]+/)[0])
    )
      bad.push(`library entry: ${info}`);
    console.log(
      `${f}: ${bad.length ? 'MISMATCH\n  ' + bad.join('\n  ') : 'ok'}`,
    );
  }
  await setLines(blank);
  s.close();
});
