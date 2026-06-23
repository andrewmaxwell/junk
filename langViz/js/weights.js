// Load model_config.json + weights.bin and decode every tensor (float16) into
// Float32Arrays keyed by name, using the manifest in the config.

// IEEE-754 half-precision (float16) -> JS double.
export function halfToFloat(h) {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h & 0x7c00) >> 10;
  const frac = h & 0x03ff;
  if (exp === 0) {
    // subnormal (or zero)
    return sign * Math.pow(2, -14) * (frac / 1024);
  } else if (exp === 0x1f) {
    return frac ? NaN : sign * Infinity;
  }
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

// Decode a run of `length` little-endian float16 values starting at byte
// `offset` of `view` into a Float32Array.
function decodeTensor(view, offset, length) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const h = view.getUint16(offset + i * 2, /* littleEndian */ true);
    out[i] = halfToFloat(h);
  }
  return out;
}

export async function loadModel(base = '.') {
  const config = await fetch(`${base}/model_config.json`).then((r) => {
    if (!r.ok) throw new Error(`failed to load model_config.json: ${r.status}`);
    return r.json();
  });
  const buf = await fetch(`${base}/weights.bin`).then((r) => {
    if (!r.ok) throw new Error(`failed to load weights.bin: ${r.status}`);
    return r.arrayBuffer();
  });

  const view = new DataView(buf);
  const tensors = new Map();
  for (const t of config.tensors) {
    tensors.set(t.name, decodeTensor(view, t.offset, t.length));
  }

  // sanity: byte length should match the manifest
  const last = config.tensors[config.tensors.length - 1];
  const expected = last.offset + last.length * 2;
  if (buf.byteLength !== expected) {
    console.warn(`weights.bin size ${buf.byteLength} != manifest end ${expected}`);
  }

  return { config, tensors };
}
