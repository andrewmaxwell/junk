// Sends one OSC message to the X32 and prints every reply that arrives within 600 ms.
// Usage: node osc.mjs <address> [,types] [args...]   e.g. node osc.mjs /load ,si scene 12
import dgram from 'node:dgram';
const [, , addr, types = ',', ...args] = process.argv;
const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const parts = [pad(Buffer.from(addr)), pad(Buffer.from(types))];
[...types.slice(1)].forEach((t, i) => {
  if (t === 'i') {
    const b = Buffer.alloc(4);
    b.writeInt32BE(+args[i]);
    parts.push(b);
  } else parts.push(pad(Buffer.from(args[i], 'latin1')));
});
const s = dgram.createSocket('udp4');
s.on('message', (m) => {
  const str = m.toString('latin1');
  const a = str.slice(0, str.indexOf('\0'));
  const tpos = Math.ceil((a.length + 1) / 4) * 4;
  const ty = str.slice(tpos, str.indexOf('\0', tpos));
  let p = tpos + Math.ceil((ty.length + 1) / 4) * 4;
  const out = [];
  for (const t of ty.slice(1)) {
    if (t === 'i') {
      out.push(m.readInt32BE(p));
      p += 4;
    } else if (t === 'f') {
      out.push(m.readFloatBE(p));
      p += 4;
    } else if (t === 's') {
      const e = str.indexOf('\0', p);
      out.push(JSON.stringify(str.slice(p, e)));
      p = Math.ceil((e + 1) / 4) * 4;
    }
  }
  console.log(a, ty, out.join(' '));
});
s.send(Buffer.concat(parts), 10023, process.env.X32 || '10.0.0.100');
setTimeout(() => s.close(), 600);
