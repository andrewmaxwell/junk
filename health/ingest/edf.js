// Minimal EDF/EDF+ reader for ResMed SD card files.
import {readFile} from 'node:fs/promises';

const text = (buf, start, len) =>
  buf.toString('latin1', start, start + len).trim();

export const readEdf = async (path) => {
  const buf = await readFile(path);
  const signalCount = +text(buf, 252, 4);
  const headerBytes = +text(buf, 184, 8);
  const recordCount = +text(buf, 236, 8);
  const recordSeconds = +text(buf, 244, 8);
  const [dd, mm, yy] = text(buf, 168, 8).split('.').map(Number);
  const [hh, mi, ss] = text(buf, 176, 8).split('.').map(Number);
  // ResMed writes the machine's local wall clock time.
  const start = new Date(Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss));

  const field = (offset, width) =>
    Array.from({length: signalCount}, (_, i) =>
      text(buf, 256 + offset * signalCount + i * width, width),
    );
  const labels = field(0, 16);
  const units = field(96, 8);
  const physMin = field(104, 8).map(Number);
  const physMax = field(112, 8).map(Number);
  const digMin = field(120, 8).map(Number);
  const digMax = field(128, 8).map(Number);
  const samplesPerRecord = field(216, 8).map(Number);

  const signals = labels.map((label, i) => ({
    label,
    unit: units[i],
    samplesPerRecord: samplesPerRecord[i],
    hz: samplesPerRecord[i] / recordSeconds,
    scale: (physMax[i] - physMin[i]) / (digMax[i] - digMin[i]),
    offset:
      physMin[i] -
      digMin[i] * ((physMax[i] - physMin[i]) / (digMax[i] - digMin[i])),
    values: [],
    raw: [],
  }));

  const recordBytes = samplesPerRecord.reduce((a, b) => a + b, 0) * 2;
  // Truncated final records happen when the machine is unplugged mid-write.
  const records = Math.min(
    recordCount === -1 ? Infinity : recordCount,
    Math.floor((buf.length - headerBytes) / recordBytes),
  );
  for (let r = 0; r < records; r++) {
    let pos = headerBytes + r * recordBytes;
    for (const s of signals) {
      if (s.label === 'EDF Annotations') {
        s.raw.push(buf.subarray(pos, pos + s.samplesPerRecord * 2));
      } else {
        for (let k = 0; k < s.samplesPerRecord; k++) {
          s.values.push(buf.readInt16LE(pos + k * 2) * s.scale + s.offset);
        }
      }
      pos += s.samplesPerRecord * 2;
    }
  }

  return {
    start,
    recordSeconds,
    records,
    signals,
    signal: (l) => signals.find((s) => s.label === l),
  };
};

// EDF+ annotations: "+onset\x15duration\x14text\x14\x00" entries, with the
// first entry of every record being an empty timekeeping annotation.
export const annotations = (edf) => {
  const out = [];
  for (const chunk of edf.signal('EDF Annotations')?.raw ?? []) {
    for (const tal of chunk.toString('latin1').split('\x00')) {
      const [timing, ...texts] = tal.split('\x14');
      if (!timing) continue;
      const [onset, duration] = timing.split('\x15');
      for (const t of texts) {
        if (t)
          out.push({
            onset: +onset,
            duration: duration ? +duration : 0,
            text: t,
          });
      }
    }
  }
  return out;
};
