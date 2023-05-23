export class World2D {
  constructor({width, height}) {
    this.points = [];
    this.constraints = [];
    this.width = width;
    this.height = height;
  }
  addPoint(x, y) {
    const point = {x, y, px: x, py: y};
    this.points.push(point);
    return point;
  }
  link(a, b, len) {
    const link = {a, b, len};
    this.constraints.push(link);
    return link;
  }
  step({stiffness}) {
    const {points, constraints, width, height} = this;

    for (const {a, b, len} of constraints) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const amount = (len / Math.hypot(dx, dy) - 1) * stiffness;
      a.x += dx * amount;
      a.y += dy * amount;
      b.x -= dx * amount;
      b.y -= dy * amount;
    }

    for (const p of points) {
      p.px = p.x;
      p.py = p.y;
      p.x = Math.max(0, Math.min(width, p.x));
      p.y = Math.max(0, Math.min(height, p.y));
    }
  }
}
