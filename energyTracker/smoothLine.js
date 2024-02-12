const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export const smoothLine = (coords, steps = 16) => {
  const result = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const c = coords[i];
    const n = coords[i + 1];
    result.push(c);
    for (let j = 0; j < steps; j++) {
      result.push({
        x: c.x + (j / steps) * (n.x - c.x),
        y: c.y + ease(j / steps) * (n.y - c.y),
      });
    }
  }
  return result;
};
