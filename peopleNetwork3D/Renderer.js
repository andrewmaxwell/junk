const focal = 0.9; // Of the shorter screen side, per unit of depth.

// Draws people as glowing dots in 3D, seen from a camera orbiting the origin.
// world = {points, edges, labels} where each point has pos, color and name,
// and edges are {a, b, color, alpha, dash}.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = {yaw: 0.6, pitch: 0.35, distance: 3.3};
    this.projected = [];
    // The part of the screen the cloud is centered in, between any panels.
    this.view = {top: 0, bottom: innerHeight};
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = Math.round(innerWidth * dpr);
    const h = Math.round(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
  }

  project([x, y, z]) {
    const {yaw, pitch, distance} = this.camera;
    const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
    const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch) + distance;
    const {top, bottom} = this.view;
    const f = (focal * Math.min(innerWidth * 0.8, bottom - top)) / z2;
    return {
      x: innerWidth / 2 + x1 * f,
      y: (top + bottom) / 2 - y2 * f,
      z: z2,
      f,
    };
  }

  // Index of the point under the screen position, or -1.
  pick(sx, sy) {
    let best = -1;
    let bestD = Infinity;
    for (const [i, p] of this.projected.entries()) {
      if (p.z <= 0.1) continue;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < Math.max(18, p.r + 6) && d - p.z * 2 < bestD) {
        best = i;
        bestD = d - p.z * 2; // Prefer the nearer of two overlapping dots.
      }
    }
    return best;
  }

  render({points, edges, focus}) {
    this.resize();
    const {ctx, dpr, camera} = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    // Things toward the back fade into the fog.
    const fog = (z) =>
      Math.max(0.12, Math.min(1, 1.35 - (z - camera.distance + 1.5) / 3.2));
    this.projected = points.map(({pos}) => {
      const p = this.project(pos);
      p.r = 0.045 * p.f;
      p.fog = fog(p.z);
      return p;
    });
    const proj = this.projected;

    ctx.lineCap = 'round';
    for (const {a, b, color, alpha, dash, width = 1} of edges) {
      const pa = proj[a];
      const pb = proj[b];
      if (pa.z <= 0.1 || pb.z <= 0.1) continue;
      ctx.globalAlpha = alpha * Math.min(pa.fog, pb.fog);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash ? [3, 5] : []);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const order = proj
      .map((p, i) => i)
      .filter((i) => proj[i].z > 0.1)
      .sort((i, j) => proj[j].z - proj[i].z);

    for (const i of order) {
      const p = proj[i];
      const {color, emphasis = 1, ring} = points[i];
      const alpha = p.fog * emphasis;

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.35;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - p.r * 3, p.y - p.r * 3, p.r * 6, p.r * 6);
      ctx.globalCompositeOperation = 'source-over';

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
      ctx.fill();

      if (ring) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 4, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    // Labels go on top, emphasized and nearer ones first, skipping any that
    // would overlap one already placed. As it turns, different names show.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const placed = [];
    const labelOrder = [...order]
      .reverse()
      .sort(
        (i, j) =>
          (j === focus) - (i === focus) ||
          (points[j].emphasis ?? 1) - (points[i].emphasis ?? 1),
      );
    for (const i of labelOrder) {
      const p = proj[i];
      const {name, emphasis = 1} = points[i];
      if (emphasis < 1) continue;
      const size = Math.max(10, Math.min(18, 0.055 * p.f));
      ctx.font = `${focus === i ? 'bold ' : ''}${size}px system-ui, sans-serif`;
      const w = ctx.measureText(name).width;
      const box = {x: p.x - w / 2, y: p.y + p.r + 2, w, h: size};
      const overlaps = placed.some(
        (b) =>
          box.x < b.x + b.w + 2 &&
          b.x < box.x + box.w + 2 &&
          box.y < b.y + b.h &&
          b.y < box.y + box.h,
      );
      if (overlaps) continue;
      placed.push(box);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = p.fog * 0.9;
      ctx.fillText(name, p.x, box.y);
    }
    ctx.globalAlpha = 1;
  }
}
