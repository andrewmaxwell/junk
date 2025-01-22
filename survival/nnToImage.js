const splitEvery = (n, arr) => {
  const res = [];
  for (let i = 0; i < arr.length; i += n) {
    res.push(arr.slice(i, i + n));
  }
  return res;
};

const normalize = (vals) => {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return min === max ? vals : vals.map((v) => (v - min) / (max - min));
};

const hashArray = (input, outputSize) =>
  splitEvery(Math.floor(input.length / outputSize), normalize(input)).map(
    (arr) => arr.reduce((a, b) => a + b, 0) % 1
  );

const numSectors = 6;

const drawSectors = (ctx, vals, rad, scale, rotation) => {
  for (let i = 0; i < numSectors; i++) {
    const hue = Math.round(vals[i * 3] * 360);
    const sat = Math.round(vals[i * 3 + 1] * 75 + 25);
    const lum = Math.round(vals[i * 3 + 2] * 60 + 20);
    ctx.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
    ctx.beginPath();
    ctx.moveTo(rad, rad);
    ctx.arc(
      rad,
      rad,
      rad * scale,
      ((i + rotation) / numSectors) * 2 * Math.PI,
      ((i + rotation + 1) / numSectors) * 2 * Math.PI
    );
    ctx.fill();
  }
};

export const nnToImage = (nn, rad) => {
  const vals = hashArray(
    nn
      .slice(1)
      .flatMap((l) => [...l.biases, ...l.weights.flatMap((r) => [...r])]),
    numSectors * 6 // 3 color components * 2 layers of sectors
  );

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.height = rad * 2;

  drawSectors(ctx, vals, rad, 1, 0);
  drawSectors(ctx, vals.slice(numSectors * 3), rad, 0.75, 0.5);

  return canvas;
};
