const hue2rgb = (p, q, t) => {
  t = ((t % 1) + 1) % 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

export const hslToRgb = (h, s, l) => {
  if (s == 0) {
    return '#' + Math.round(l).toString(16).padStart(2, 0).repeat(3);
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);
    return (
      '#' +
      Math.floor(r * 256)
        .toString(16)
        .padStart(2, 0) +
      Math.floor(g * 256)
        .toString(16)
        .padStart(2, 0) +
      Math.floor(b * 256)
        .toString(16)
        .padStart(2, 0)
    );
  }
};
