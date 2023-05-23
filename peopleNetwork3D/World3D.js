export class World3D {
  constructor({width, height, depth}) {
    this.points = [];
    this.constraints = [];
    this.width = width;
    this.height = height;
    this.depth = depth;
  }
  addPoint(x, y, z) {
    const point = {x, y, z, px: x, py: y, pz: z};
    this.points.push(point);
    return point;
  }
  link(a, b, len) {
    const link = {a, b, len};
    this.constraints.push(link);
    return link;
  }
  step({stiffness}) {
    const {points, constraints, width, height, depth} = this;

    for (const {a, b, len} of constraints) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const amount = (len / Math.hypot(dx, dy, dz) - 1) * stiffness;
      a.x += dx * amount;
      a.y += dy * amount;
      a.z += dz * amount;
      b.x -= dx * amount;
      b.y -= dy * amount;
      b.z -= dz * amount;
    }

    for (const p of points) {
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.x = Math.max(-width / 2, Math.min(width / 2, p.x));
      p.y = Math.max(-height / 2, Math.min(height / 2, p.y));
      p.z = Math.max(-depth / 2, Math.min(depth / 2, p.z));
    }
  }
}
