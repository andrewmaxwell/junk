export const rand = (min, max) => min + Math.random() * (max - min);

export const pointInRect = (x, y, x1, y1, x2, y2) =>
  Math.abs(x - (x1 + x2) / 2) * 2 <= Math.abs(x1 - x2) &&
  Math.abs(y - (y1 + y2) / 2) * 2 <= Math.abs(y1 - y2);

export const sqDist = (x, y) => x * x + y * y;
