const EPS = 1e-7; // clipping tolerance
const EPS_SQ = 1e-8; // (0.0001)², used for contact dedup

/** @typedef {{x:number,y:number}} Point */
/** @type {(A:Point[], B:Point[]) => {normalX:number, normalY:number, depth:number, contacts:Point[]} | null} */
export function detectCollision(A, B) {
  const lenA = A.length;
  const lenB = B.length;

  let depth = Infinity;
  let normalX = 0;
  let normalY = 0;

  // ─────────────────────────────────────────────────────────────
  // 1.  Separating-Axis Test on all edge normals from A & B
  // ─────────────────────────────────────────────────────────────
  for (let polyId = 0; polyId < 2; ++polyId) {
    const P = polyId === 0 ? A : B;
    let px = P[P.length - 1].x;
    let py = P[P.length - 1].y;

    for (let i = 0; i < P.length; ++i) {
      const vx = P[i].x;
      const vy = P[i].y;

      // outward normal of edge (px,py) → (vx,vy)
      let nx = py - vy;
      let ny = vx - px;
      const lenSq = nx * nx + ny * ny;
      if (lenSq === 0) {
        // degenerate edge
        px = vx;
        py = vy;
        continue;
      }
      const invLen = 1 / Math.sqrt(lenSq);
      nx *= invLen;
      ny *= invLen;

      // project A
      let minA = A[0].x * nx + A[0].y * ny;
      let maxA = minA;
      for (let j = 1; j < lenA; ++j) {
        const d = A[j].x * nx + A[j].y * ny;
        if (d < minA) minA = d;
        else if (d > maxA) maxA = d;
      }

      // project B
      let minB = B[0].x * nx + B[0].y * ny;
      let maxB = minB;
      for (let j = 1; j < lenB; ++j) {
        const d = B[j].x * nx + B[j].y * ny;
        if (d < minB) minB = d;
        else if (d > maxB) maxB = d;
      }

      // gap ⇒ no collision
      if (maxA < minB || maxB < minA) return null;

      const o = (maxA < maxB ? maxA : maxB) - (minA > minB ? minA : minB);
      if (o < depth) {
        depth = o;
        normalX = nx;
        normalY = ny;
      }

      px = vx;
      py = vy; // next edge
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2.  Make the normal point from A → B
  // ─────────────────────────────────────────────────────────────
  let cxA = 0,
    cyA = 0;
  for (let i = 0; i < lenA; ++i) {
    cxA += A[i].x;
    cyA += A[i].y;
  }
  cxA /= lenA;
  cyA /= lenA;

  let cxB = 0,
    cyB = 0;
  for (let i = 0; i < lenB; ++i) {
    cxB += B[i].x;
    cyB += B[i].y;
  }
  cxB /= lenB;
  cyB /= lenB;

  if ((cxB - cxA) * normalX + (cyB - cyA) * normalY < 0) {
    normalX = -normalX;
    normalY = -normalY;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.  Sutherland–Hodgman clip  (clip A against every edge of B)
  //     Two scratch buffers are reused to avoid per-edge GC,
  //     but the caller’s vertex arrays are NEVER mutated.
  // ─────────────────────────────────────────────────────────────
  let inPts = A.slice(); // shallow copy – preserves caller data
  let outPts = new Array(inPts.length + B.length); // spare capacity

  for (let i = 0, j = B.length - 1; i < B.length; j = i++) {
    const nx = B[i].y - B[j].y; // inward-pointing normal
    const ny = B[j].x - B[i].x;
    const c = nx * B[j].x + ny * B[j].y;

    outPts.length = 0; // reset scratch buffer

    let prev = inPts[inPts.length - 1];
    let prevDist = nx * prev.x + ny * prev.y - c;

    for (let k = 0; k < inPts.length; ++k) {
      const curr = inPts[k];
      const currDist = nx * curr.x + ny * curr.y - c;

      // edge crosses the clip line → intersect
      if (prevDist * currDist < -EPS) {
        const t = prevDist / (prevDist - currDist);
        outPts.push({
          x: prev.x + (curr.x - prev.x) * t,
          y: prev.y + (curr.y - prev.y) * t,
        });
      }
      // keep vertex inside (≤ 0)
      if (currDist <= EPS) outPts.push(curr);

      prev = curr;
      prevDist = currDist;
    }

    if (!outPts.length) return null; // fully outside

    // swap buffers for next edge
    const tmp = inPts;
    inPts = outPts;
    outPts = tmp;
  }

  // ─────────────────────────────────────────────────────────────
  // 4.  De-duplicate contact points (< 0.0001 px apart)
  // ─────────────────────────────────────────────────────────────
  const contacts = [];
  outer: for (let i = 0; i < inPts.length; ++i) {
    const p = inPts[i];
    for (let j = 0; j < contacts.length; ++j) {
      const q = contacts[j];
      const dx = q.x - p.x,
        dy = q.y - p.y;
      if (dx * dx + dy * dy < EPS_SQ) continue outer;
    }
    contacts.push(p);
  }

  return {normalX, normalY, depth, contacts};
}
