// Iterative in-place radix-2 complex FFT.
export class FFT {
  constructor(n) {
    if (n & (n - 1)) throw new Error('FFT size must be a power of two');
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);

    // rev[i] is rev[i>>1] shifted down one place with i's low bit moved to the
    // top. Building it from the entry below costs one step per element rather
    // than one per bit, which matters: at the largest padding this table is a
    // quarter of a million entries and it is rebuilt whenever the grid changes.
    for (let i = 1; i < n; i++) {
      this.rev[i] = (this.rev[i >> 1] >> 1) | ((i & 1) << (bits - 1));
    }

    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }

    // Scratch for the padded entry point below, which has to read the input
    // before it starts scattering over it.
    this.sr = null;
    this.si = null;
  }

  // `nz`, when given, promises that everything from `nz` onwards is zero — the
  // zero-padded case, which is every frame of an analysis that pads at all.
  //
  // That promise is worth a lot. After the bit-reversal permutation the only
  // non-zero entries sit at multiples of `pad = n/nz`, one per aligned block of
  // `pad`, and every butterfly stage below `size = 2*pad` combines a value with
  // a zero: `re[j+half] = re[j] - 0`, `re[j] += 0`. So those log2(pad) stages
  // are not arithmetic at all, they are a broadcast of each value across its
  // own block — and the remaining stages are the whole of the work.
  //
  // At the deepest zoom `pad` is 256 of an 18-stage transform, so this is 44%
  // of the FFT gone. It also saves the caller zeroing the tail, which is the
  // larger part of the array.
  transform(re, im, nz = this.n) {
    const {n, rev, cos, sin} = this;

    let first = 2;

    if (nz < n) {
      const pad = n / nz;

      if (!this.sr || this.sr.length < nz) {
        this.sr = new Float32Array(nz);
        this.si = new Float32Array(nz);
      }

      const {sr, si} = this;

      for (let i = 0; i < nz; i++) {
        sr[i] = re[i];
        si[i] = im[i];
      }

      for (let i = 0; i < nz; i++) {
        const j = rev[i]; // a multiple of pad, since i's high bits are zero
        const vr = sr[i];
        const vi = si[i];

        for (let k = j, end = j + pad; k < end; k++) {
          re[k] = vr;
          im[k] = vi;
        }
      }

      first = 2 * pad;
    } else {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i];
          re[i] = re[j];
          re[j] = t;
          t = im[i];
          im[i] = im[j];
          im[j] = t;
        }
      }
    }

    for (let size = first; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = cos[k],
            s = sin[k];
          const tre = re[j + half] * c - im[j + half] * s;
          const tim = re[j + half] * s + im[j + half] * c;
          re[j + half] = re[j] - tre;
          im[j + half] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  }
}
