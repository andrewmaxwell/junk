'use strict';

const MAX_BOUNCES = 12;
const RAY_EPSILON = 0.001;
const INTERSECTION_SLACK = 0.1;
// 28 wavelengths spanning violet → red (IOR delta and hue)
function generateSpectrum(n) {
  return Array.from({length: n}, (_, i) => {
    const t = i / (n - 1);
    return {
      hue: Math.round((1 - t) * 275),
      iorDelta: 0.065 * (1 - 2 * t),
    };
  });
}

const SPECTRUM_FULL = generateSpectrum(28);
const SPECTRUM_DRAFT = generateSpectrum(14);

// Math helpers
const dot = (a, b) => a.x * b.x + a.y * b.y;
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const normalize = (v) => {
  const l = Math.sqrt(v.x * v.x + v.y * v.y);
  return l ? {x: v.x / l, y: v.y / l} : {x: 0, y: 0};
};

// True if a point satisfies one surface's solid-side constraint.
// Convex (sign > 0): inside the circle. Concave (sign < 0): outside it.
function surfaceOK(pt, center, r, sign) {
  const d = distSq(pt, center);
  return sign > 0
    ? d <= r * r + INTERSECTION_SLACK
    : d >= r * r - INTERSECTION_SLACK;
}

function getIntersections(lens, ray) {
  const ocX = ray.o.x - lens.x;
  const ocY = ray.o.y - lens.y;
  const bHalf = ocX * ray.d.x + ocY * ray.d.y;
  const bC = ocX * ocX + ocY * ocY - lens.boundingRadius * lens.boundingRadius;
  if (bC > 0 && bHalf > 0) return [];
  if (bHalf * bHalf - bC < 0) return [];

  const hits = [];

  // Left surface faces −axis; right surface faces +axis.
  // prettier-ignore
  checkSurface(lens, ray, hits, lens.c1, lens.r1, lens.sign1, lens.c2, lens.r2, lens.sign2, -1);
  // prettier-ignore
  checkSurface(lens, ray, hits, lens.c2, lens.r2, lens.sign2, lens.c1, lens.r1, lens.sign1, 1);

  // Cylindrical rim segments absorb any ray that enters through the edge.
  rimHit(ray, lens.rimLT, lens.rimRT, hits, lens.ior);
  rimHit(ray, lens.rimLB, lens.rimRB, hits, lens.ior);

  return hits;
}

// Curved-surface intersection. `faceAxial` is +1 if the surface's outward
// normal should point along +axis (right surface) or −1 (left surface).
// prettier-ignore
function checkSurface(lens, ray, hits, cc, cr, sign, oc, ocr, oSign, faceAxial) {
  const {axis, perp, H} = lens;
  const dx = ray.o.x - cc.x;
  const dy = ray.o.y - cc.y;
  const b = 2 * (dx * ray.d.x + dy * ray.d.y);
  const c = dx * dx + dy * dy - cr * cr;
  const disc = b * b - 4 * c;
  if (disc < 0) return;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / 2, (-b + sq) / 2]) {
    if (t <= RAY_EPSILON) continue;
    const pt = {x: ray.o.x + ray.d.x * t, y: ray.o.y + ray.d.y * t};
    const v = (pt.x - lens.x) * perp.x + (pt.y - lens.y) * perp.y;
    if (Math.abs(v) > H + INTERSECTION_SLACK) continue;
    if (!surfaceOK(pt, oc, ocr, oSign)) continue;
    // Outward normal (away from the glass): for a convex surface that's
    // away from the circle center, for concave it's toward it — hence ·sign.
    const gn = normalize({x: pt.x - cc.x, y: pt.y - cc.y});
    const n = {x: gn.x * sign, y: gn.y * sign};
    const outwardAxial = n.x * axis.x + n.y * axis.y;
    // Keep only the branch whose outward normal faces this surface's side.
    if (faceAxial < 0 ? outwardAxial > 0.02 : outwardAxial < -0.02) continue;
    const absorb = Math.abs(v) >= H - 3;
    hits.push({t, pt, normal: n, ior: lens.ior, absorb});
  }
}

// Ray vs. a rim line segment (a→b). Any hit absorbs the ray.
function rimHit(ray, a, b, hits, ior) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = ray.d.x * ey - ray.d.y * ex;
  if (Math.abs(denom) < 1e-9) return; // parallel
  const wx = a.x - ray.o.x;
  const wy = a.y - ray.o.y;
  const t = (wx * ey - wy * ex) / denom;
  const s = (wx * ray.d.y - wy * ray.d.x) / denom;
  if (t <= RAY_EPSILON || s < 0 || s > 1) return;
  const pt = {x: ray.o.x + ray.d.x * t, y: ray.o.y + ray.d.y * t};
  hits.push({t, pt, normal: {x: 0, y: 0}, ior, absorb: true});
}

function refract(d, normal, ior, iorDelta) {
  const effectiveIor = ior + iorDelta;
  let cosI = dot(d, normal);
  let n1, n2, N;
  if (cosI < 0) {
    n1 = 1.0;
    n2 = effectiveIor;
    N = normal;
    cosI = -cosI;
  } else {
    n1 = effectiveIor;
    n2 = 1.0;
    N = {x: -normal.x, y: -normal.y};
  }
  const eta = n1 / n2;
  const sinT2 = eta * eta * (1 - cosI * cosI);

  const reflect = () => {
    const k = dot(d, N);
    return {x: d.x - 2 * k * N.x, y: d.y - 2 * k * N.y};
  };

  if (sinT2 > 1) return reflect(); // total internal reflection

  const cosT = Math.sqrt(1 - sinT2);
  return {
    x: eta * d.x + (eta * cosI - cosT) * N.x,
    y: eta * d.y + (eta * cosI - cosT) * N.y,
  };
}

function traceRay(origin, dir, lenses, iorDelta, far) {
  const points = [origin];
  let ray = {o: origin, d: dir};
  for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    let best = null;
    let minT = Infinity;
    for (const lens of lenses) {
      for (const hit of getIntersections(lens, ray)) {
        if (hit.t < minT) {
          minT = hit.t;
          best = hit;
        }
      }
    }
    if (!best) {
      points.push({x: ray.o.x + ray.d.x * far, y: ray.o.y + ray.d.y * far});
      return points;
    }
    points.push(best.pt);
    if (best.absorb) return points;
    const newDir = refract(ray.d, best.normal, best.ior, iorDelta);
    ray = {
      o: {
        x: best.pt.x + newDir.x * RAY_EPSILON,
        y: best.pt.y + newDir.y * RAY_EPSILON,
      },
      d: newDir,
    };
  }
  points.push({x: ray.o.x + ray.d.x * far, y: ray.o.y + ray.d.y * far});
  return points;
}

let offscreen = null;
let offCtx = null;

self.onmessage = ({data}) => {
  const {
    lenses,
    lightMode,
    width,
    height,
    dpr,
    numRays,
    numWavelengths,
    rayAlpha,
    wavelengthAlpha,
  } = data;

  if (
    !offscreen ||
    offscreen.width !== width * dpr ||
    offscreen.height !== height * dpr
  ) {
    offscreen = new OffscreenCanvas(width * dpr, height * dpr);
    offCtx = offscreen.getContext('2d');
  }

  const far = Math.max(width, height) * 2;

  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, width, height);
  offCtx.globalCompositeOperation = 'screen';

  if (lightMode === 'colored') {
    offCtx.lineWidth = 1;
    const step = height / numRays;
    for (let i = 0; i <= numRays; i++) {
      const path = traceRay({x: 0, y: i * step}, {x: 1, y: 0}, lenses, 0, far);
      if (path.length < 2) continue;
      offCtx.beginPath();
      offCtx.moveTo(path[0].x, path[0].y);
      for (let j = 1; j < path.length; j++) offCtx.lineTo(path[j].x, path[j].y);
      offCtx.strokeStyle = `hsla(${(i / numRays) * 360},100%,65%,${rayAlpha})`;
      offCtx.stroke();
    }
  } else {
    offCtx.lineWidth = 1.5;
    const spectrum = numWavelengths > 14 ? SPECTRUM_FULL : SPECTRUM_DRAFT;
    const step = height / numRays;
    for (let i = 0; i <= numRays; i++) {
      const y = i * step;
      const origin = {x: 0, y};
      for (const {hue, iorDelta} of spectrum) {
        const path = traceRay(origin, {x: 1, y: 0}, lenses, iorDelta, far);
        if (path.length < 2) continue;
        offCtx.beginPath();
        offCtx.moveTo(path[0].x, path[0].y);
        for (let j = 1; j < path.length; j++)
          offCtx.lineTo(path[j].x, path[j].y);
        offCtx.strokeStyle = `hsla(${hue},100%,65%,${wavelengthAlpha})`;
        offCtx.stroke();
      }
    }
  }

  offCtx.globalCompositeOperation = 'source-over';
  const bitmap = offscreen.transferToImageBitmap();
  self.postMessage({bitmap}, [bitmap]);
};
