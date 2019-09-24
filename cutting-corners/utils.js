export const interpolate = (a, b, s) => ({
  x: a.x * (1 - s) + b.x * s,
  y: a.y * (1 - s) + b.y * s
});

const getAngle = (a, b, c) => {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(b.x - c.x, b.y - c.y);
  const ac = Math.hypot(c.x - a.x, c.y - a.y);
  return Math.acos((bc * bc + ab * ab - ac * ac) / (2 * bc * ab));
};

export const indexOfMinAngle = vertices => {
  let index = 0,
    minAngle = Infinity;
  vertices.forEach((p, i) => {
    const angle = getAngle(
      vertices[(i - 1 + vertices.length) % vertices.length],
      p,
      vertices[(i + 1) % vertices.length]
    );
    if (angle < minAngle) {
      minAngle = angle;
      index = i;
    }
  });
  return index;
};

export const filterPoints = (vertices, minLength) => {
  if (vertices.length < 4) return vertices;
  const filtered = vertices.filter((p, i) => {
    const next = vertices[(i + 1) % vertices.length];
    return Math.hypot(next.x - p.x, next.y - p.y) > minLength;
  });
  return filtered.length > 2 ? filtered : vertices;
};
