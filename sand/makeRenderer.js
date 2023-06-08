export const makeRenderer = (canvas, width, height, toColor) => {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {alpha: false, antialias: false});

  const imageData = ctx.createImageData(width, height);
  const buf = new ArrayBuffer(imageData.data.length);
  const buf8 = new Uint8ClampedArray(buf);
  const data = new Uint32Array(buf);

  return (vals) => {
    for (let i = 0; i < data.length; i++) {
      data[i] = toColor(vals[i], vals, i);
    }
    imageData.data.set(buf8);
    ctx.putImageData(imageData, 0, 0);
  };
};

export const color = (r, g, b, a = 255) => (a << 24) | (b << 16) | (g << 8) | r;

export const makeGradient = (colors, colorSteps = 256) => {
  const gradient = [];
  for (let i = 0; i <= colorSteps; i++) {
    const cIndex = Math.max(
      0,
      Math.min(gradient.length - 1, (i / colorSteps) * (colors.length - 1))
    );
    const c1 = colors[Math.floor(cIndex)];
    const c2 = colors[Math.ceil(cIndex)];
    const m = cIndex % 1;
    gradient[i] = color(
      c1[0] * (1 - m) + c2[0] * m,
      c1[1] * (1 - m) + c2[1] * m,
      c1[2] * (1 - m) + c2[2] * m
    );
  }
  return (v) => gradient[Math.floor(v * colorSteps)];
};
