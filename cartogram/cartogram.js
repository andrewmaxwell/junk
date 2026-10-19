// Flow-based cartogram (Gastner, Seguy & More 2018). The map's density
// (target area over current area, with the sea set to the average) is
// rasterized onto a grid. Picture the density sliding linearly from that
// starting map to perfectly even as t goes from 0 to 1: ρ(t) = (1-t)ρ0 + tρ̄.
// Mass is conserved if ρv = -∇Φ with ∇²Φ = ρ̄ - ρ0, which doesn't depend on t,
// so one Poisson solve gives the whole flow, v = -∇Φ / ρ(t). Every point
// rides it from t = 0 to 1, so dense regions spread out and sparse ones
// shrink. The flow is smooth, so neighbors stay neighbors and borders never
// cross. One run doesn't hit the targets exactly, so it's repeated on its
// own output.

// In-place radix-2 FFT. `inverse` includes the 1/n scaling.
const fft = (re, im, inverse) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const ang = ((inverse ? 2 : -2) * Math.PI) / size;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k);
      const wi = Math.sin(ang * k);
      for (let s = k; s < n; s += size) {
        const t = s + half;
        const xr = re[t] * wr - im[t] * wi;
        const xi = re[t] * wi + im[t] * wr;
        re[t] = re[s] - xr;
        im[t] = im[s] - xi;
        re[s] += xr;
        im[s] += xi;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
};

// 1D DCT-II and its inverse via an FFT of the same length (Makhoul 1980).
// `x` is read from data[off + i*stride] and the result written back there.
const makeDct = (n) => {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const cos = Float64Array.from({length: n}, (_, k) =>
    Math.cos((Math.PI * k) / (2 * n)),
  );
  const sin = Float64Array.from({length: n}, (_, k) =>
    Math.sin((Math.PI * k) / (2 * n)),
  );
  const forward = (data, off, stride) => {
    for (let i = 0; i < n / 2; i++) {
      re[i] = data[off + 2 * i * stride];
      re[n - 1 - i] = data[off + (2 * i + 1) * stride];
    }
    im.fill(0);
    fft(re, im, false);
    for (let k = 0; k < n; k++)
      data[off + k * stride] = re[k] * cos[k] + im[k] * sin[k];
  };
  const inverse = (data, off, stride) => {
    re[0] = data[off];
    im[0] = 0;
    for (let k = 1; k < n; k++) {
      const a = data[off + k * stride];
      const b = -data[off + (n - k) * stride];
      re[k] = a * cos[k] - b * sin[k];
      im[k] = a * sin[k] + b * cos[k];
    }
    fft(re, im, true);
    for (let i = 0; i < n / 2; i++) {
      data[off + 2 * i * stride] = re[i];
      data[off + (2 * i + 1) * stride] = re[n - 1 - i];
    }
  };
  return {forward, inverse};
};

const makeDct2 = (w, h) => {
  const row = makeDct(w);
  const col = makeDct(h);
  return {
    forward(d) {
      for (let y = 0; y < h; y++) row.forward(d, y * w, 1);
      for (let x = 0; x < w; x++) col.forward(d, x, w);
    },
    inverse(d) {
      for (let x = 0; x < w; x++) col.inverse(d, x, w);
      for (let y = 0; y < h; y++) row.inverse(d, y * w, 1);
    },
  };
};

const ringArea = (pts, ring) => {
  let a = 0;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const p = ring[j] * 2;
    const q = ring[k] * 2;
    a += pts[p] * pts[q + 1] - pts[q] * pts[p + 1];
  }
  return Math.abs(a / 2);
};

// Rings are point-index arrays; the first ring of each polygon is its outline
// and the rest are holes.
export const featureAreas = (pts, features) =>
  features.map((polys) =>
    polys.reduce(
      (sum, rings) =>
        rings.reduce((s, r, i) => s + (i ? -1 : 1) * ringArea(pts, r), sum),
      0,
    ),
  );

// How far the areas are from `weights` (scaled to the same total): `misplaced`
// is the share of the total area that's in the wrong feature, and `errs` holds
// each feature's |area / target - 1|. Features far smaller than a grid cell
// can't be fixed by the grid, so the area-weighted measure ignores them.
export const areaErrors = (areas, weights) => {
  const totalA = areas.reduce((a, b) => a + b, 0);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const targets = weights.map((wt) => (wt / totalW) * totalA);
  return {
    misplaced:
      areas.reduce((s, a, i) => s + Math.abs(a - targets[i]), 0) / (2 * totalA),
    errs: areas.map((a, i) => Math.abs(a / targets[i] - 1)),
  };
};

// Mass per grid cell. Each feature's target mass is spread evenly over the
// subsamples it covers, so features smaller than a cell still count; one that
// covers none puts it all in the cell under its first point.
const rasterize = (pts, features, masses, w, h, S) => {
  const W = w * S;
  const owner = new Int32Array(W * h * S).fill(-1);
  features.forEach((polys, f) => {
    const edges = [];
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const rings of polys) {
      for (const ring of rings) {
        for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
          const p = ring[j] * 2;
          const q = ring[k] * 2;
          edges.push(pts[p] * S, pts[p + 1] * S, pts[q] * S, pts[q + 1] * S);
          y0 = Math.min(y0, pts[p + 1] * S);
          y1 = Math.max(y1, pts[p + 1] * S);
        }
      }
    }
    const xs = [];
    for (
      let r = Math.max(0, Math.ceil(y0 - 0.5));
      r <= Math.min(h * S - 1, y1 - 0.5);
      r++
    ) {
      const y = r + 0.5;
      xs.length = 0;
      for (let e = 0; e < edges.length; e += 4) {
        const ay = edges[e + 1];
        const by = edges[e + 3];
        if (ay <= y !== by <= y)
          xs.push(
            edges[e] + ((y - ay) / (by - ay)) * (edges[e + 2] - edges[e]),
          );
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let c = Math.max(0, Math.ceil(xs[k] - 0.5)); c <= c1; c++)
          owner[r * W + c] = f;
      }
    }
  });

  const counts = new Float64Array(features.length);
  for (const o of owner) if (o >= 0) counts[o]++;
  const rho = new Float64Array(w * h);
  const sub = 1 / (S * S);
  for (let r = 0; r < h * S; r++) {
    for (let c = 0; c < W; c++) {
      const o = owner[r * W + c];
      rho[((r / S) | 0) * w + ((c / S) | 0)] +=
        o < 0 ? sub : masses[o] / counts[o];
    }
  }
  features.forEach((polys, f) => {
    if (counts[f]) return;
    const p = polys[0][0][0] * 2;
    const x = Math.min(w - 1, Math.max(0, pts[p] | 0));
    const y = Math.min(h - 1, Math.max(0, pts[p + 1] | 0));
    rho[y * w + x] += masses[f];
  });
  return rho;
};

// One flow-based cartogram on points already in grid coordinates. Calls
// onStep() now and then so the caller can show progress. `blur` smooths the
// density first (like diffusing for that long), which keeps the flow gentle
// around features smaller than a cell. Later passes use less.
const flow = (pts, rho, w, h, blur, onStep) => {
  const dct = makeDct2(w, h);
  const coef = Float64Array.from(rho);
  dct.forward(coef);
  const kx = Float64Array.from({length: w}, (_, k) => (Math.PI * k) / w);
  const ky = Float64Array.from({length: h}, (_, k) => (Math.PI * k) / h);
  const mean = coef[0] / (w * h);

  // The blurred starting density, and Φ from ∇²Φ = ρ̄ - ρ0 (the mean term
  // drops out, and the cosine basis gives the sides a no-flow boundary).
  const rho0 = new Float64Array(w * h);
  const phi = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k2 = kx[x] * kx[x] + ky[y] * ky[y];
      rho0[i] = coef[i] * Math.exp(-k2 * blur);
      phi[i] = i ? rho0[i] / k2 : 0;
    }
  }
  dct.inverse(rho0);
  dct.inverse(phi);

  // ∇Φ at cell centers by central differences, zero on the boundary.
  const gx = new Float64Array(w * h);
  const gy = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = (phi[i + 1] - phi[i - 1]) / 2;
      gy[i] = (phi[i + w] - phi[i - w]) / 2;
    }
  }

  // Interpolating ∇Φ and ρ0 separately, then dividing, stays accurate where
  // the density changes sharply within a cell.
  const velocity = (x, y, t, out, o) => {
    const u = Math.min(w - 1.0001, Math.max(0, x - 0.5));
    const v = Math.min(h - 1.0001, Math.max(0, y - 0.5));
    const i = u | 0;
    const j = v | 0;
    const fx = u - i;
    const fy = v - j;
    const a = j * w + i;
    const lerp = (g) =>
      (g[a] * (1 - fx) + g[a + 1] * fx) * (1 - fy) +
      (g[a + w] * (1 - fx) + g[a + w + 1] * fx) * fy;
    const r = (1 - t) * lerp(rho0) + t * mean;
    out[o] = -lerp(gx) / r;
    out[o + 1] = -lerp(gy) / r;
  };

  const n = pts.length;
  const v1 = new Float64Array(n);
  const v2 = new Float64Array(n);
  const mid = new Float64Array(n);
  let t = 0;
  let dt = 0.01;
  for (let p = 0; p < n; p += 2) velocity(pts[p], pts[p + 1], t, v1, p);

  // Heun's method with step-size control: halve dt when the predictor and
  // corrector disagree by more than a small fraction of a cell.
  while (t < 1) {
    dt = Math.min(dt, 1 - t);
    let err = 0;
    for (let p = 0; p < n; p += 2) {
      mid[p] = pts[p] + dt * v1[p];
      mid[p + 1] = pts[p + 1] + dt * v1[p + 1];
      velocity(mid[p], mid[p + 1], t + dt, v2, p);
      err = Math.max(
        err,
        (dt / 2) * Math.hypot(v2[p] - v1[p], v2[p + 1] - v1[p + 1]),
      );
    }
    if (err > 0.02 && dt > 1e-7) {
      dt /= 2;
      continue;
    }
    for (let p = 0; p < n; p += 2) {
      pts[p] = Math.min(w, Math.max(0, pts[p] + (dt / 2) * (v1[p] + v2[p])));
      pts[p + 1] = Math.min(
        h,
        Math.max(0, pts[p + 1] + (dt / 2) * (v1[p + 1] + v2[p + 1])),
      );
    }
    t += dt;
    for (let p = 0; p < n; p += 2) velocity(pts[p], pts[p + 1], t, v1, p);
    onStep();
    dt *= 1.5;
  }
};

// Repeated cartograms until the areas match `weights` (or `passes` runs out).
// `res` is the grid's long side, a power of two.
export const makeCartogram = (
  {points, features, weights, passes, res},
  onProgress,
) => {
  const pts = Float64Array.from(points);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let p = 0; p < pts.length; p += 2) {
    x0 = Math.min(x0, pts[p]);
    x1 = Math.max(x1, pts[p]);
    y0 = Math.min(y0, pts[p + 1]);
    y1 = Math.max(y1, pts[p + 1]);
  }
  const aspect = (y1 - y0) / (x1 - x0);
  const w =
    aspect > 1 ? res / 2 ** Math.min(2, Math.round(Math.log2(aspect))) : res;
  const h =
    aspect > 1 ? res : res / 2 ** Math.min(2, Math.round(-Math.log2(aspect)));

  let errors = areaErrors(featureAreas(pts, features), weights);
  for (let pass = 0; pass < passes && errors.misplaced > 0.005; pass++) {
    // Fit the current map into the middle of the grid, leaving sea around it
    // for features to grow into, which they mostly do in the first pass. A
    // uniform scale keeps the area ratios.
    x0 = y0 = Infinity;
    x1 = y1 = -Infinity;
    for (let p = 0; p < pts.length; p += 2) {
      x0 = Math.min(x0, pts[p]);
      x1 = Math.max(x1, pts[p]);
      y0 = Math.min(y0, pts[p + 1]);
      y1 = Math.max(y1, pts[p + 1]);
    }
    const fill = pass ? 0.8 : 0.6;
    const s = Math.min((w * fill) / (x1 - x0), (h * fill) / (y1 - y0));
    const ox = (w - s * (x1 + x0)) / 2;
    const oy = (h - s * (y1 + y0)) / 2;
    for (let p = 0; p < pts.length; p += 2) {
      pts[p] = pts[p] * s + ox;
      pts[p + 1] = pts[p + 1] * s + oy;
    }
    const toMap = () => {
      const out = new Float64Array(pts.length);
      for (let p = 0; p < pts.length; p += 2) {
        out[p] = (pts[p] - ox) / s;
        out[p + 1] = (pts[p + 1] - oy) / s;
      }
      return out;
    };

    const areas = featureAreas(pts, features);
    const totalA = areas.reduce((a, b) => a + b, 0);
    const totalW = weights.reduce((a, b) => a + b, 0);
    const masses = weights.map((wt) => (wt / totalW) * totalA);
    const rho = rasterize(pts, features, masses, w, h, 4);

    let last = performance.now();
    flow(pts, rho, w, h, 1 / (pass + 1) ** 2, () => {
      const now = performance.now();
      if (now - last < 100) return;
      last = now;
      onProgress({points: toMap(), pass, error: errors});
    });
    const out = toMap();
    pts.set(out);
    errors = areaErrors(featureAreas(pts, features), weights);
    onProgress({points: out, pass, error: errors});
  }
  return {points: pts, error: errors};
};
