// Helps ring out a mic on the X32.
//   node ringout.mjs watch            log the loudest RTA peaks once a second (Ctrl-C to stop)
//   node ringout.mjs eq [ch]          show a channel's EQ
//   node ringout.mjs cut ch band freq gain q   set one EQ band to a PEQ, e.g. cut 2 2 2500 -4 8
import dgram from 'node:dgram';

const host = process.env.X32 || '10.0.0.100';
const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const msg = (addr, types = '', ...args) =>
  Buffer.concat([
    pad(Buffer.from(addr)),
    pad(Buffer.from(',' + types)),
    ...args.map((a, i) => {
      if (types[i] === 's') return pad(Buffer.from(a));
      const b = Buffer.alloc(4);
      if (types[i] === 'i') b.writeInt32BE(a);
      else b.writeFloatBE(a);
      return b;
    }),
  ]);

const s = dgram.createSocket('udp4');
const send = (m) => s.send(m, 10023, host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const two = (n) => String(n).padStart(2, '0');

const showEq = async (ch) => {
  const lines = [];
  s.on('message', (m) => {
    const t = m.toString('latin1');
    if (t.startsWith('node'))
      lines.push(t.slice(12).replace(/\0+$/, '').trim());
  });
  for (const p of ['eq', 'eq/1', 'eq/2', 'eq/3', 'eq/4']) {
    send(msg('/node', 's', `ch/${two(ch)}/${p}`));
    await wait(50);
  }
  await wait(200);
  console.log(lines.join('\n'));
};

// RTA: 100 bands spaced logarithmically from 20 Hz to 20 kHz, in 1/256 dB.
const bandHz = (i) => 20 * Math.pow(1000, i / 99);

const watch = () => {
  let max = new Array(100).fill(-128);
  s.on('message', (m) => {
    if (!m.toString('latin1', 0, 10).startsWith('/meters/15')) return;
    for (let i = 0; i < 100; i++)
      max[i] = Math.max(max[i], m.readInt16LE(24 + i * 2) / 256);
  });
  const subscribe = () => send(msg('/meters', 's', '/meters/15'));
  subscribe();
  setInterval(subscribe, 9000);
  setInterval(() => {
    const sorted = [...max].sort((a, b) => a - b);
    const median = sorted[50];
    const peaks = max
      .map((v, i) => ({v, i}))
      .filter(({v, i}) => i > 0 && i < 99 && v >= max[i - 1] && v >= max[i + 1])
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map(({v, i}) => {
        // Interpolate between neighboring bands for a closer frequency estimate.
        const [a, b, c] = [max[i - 1], v, max[i + 1]];
        const d = a - 2 * b + c ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
        return `${Math.round(bandHz(i + d))}Hz ${v.toFixed(1)}dB (+${(v - median).toFixed(0)})`;
      });
    console.log(new Date().toLocaleTimeString(), peaks.join('  '));
    max = new Array(100).fill(-128);
  }, 1000);
};

const cut = async (ch, band, freq, gain, q) => {
  const base = `/ch/${two(ch)}/eq/${band}`;
  send(msg(`${base}/type`, 'i', 2)); // PEQ
  send(msg(`${base}/f`, 'f', Math.log(freq / 20) / Math.log(1000)));
  send(msg(`${base}/g`, 'f', (gain + 15) / 30));
  send(msg(`${base}/q`, 'f', Math.log(q / 10) / Math.log(0.3 / 10)));
  await wait(100);
  await showEq(ch);
};

const [cmd, ...args] = process.argv.slice(2);
s.bind(async () => {
  if (cmd === 'watch') return watch();
  if (cmd === 'eq') await showEq(Number(args[0] || 2));
  else if (cmd === 'cut') await cut(...args.map(Number));
  else console.log('usage: watch | eq [ch] | cut ch band freq gain q');
  s.close();
});
