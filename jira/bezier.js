export const bezier = (coords, numPoints = 32) => {
  const result = [];
  const xc = new Float32Array(coords.length);
  const yc = new Float32Array(coords.length);
  for (let i = 0; i < numPoints; i++) {
    for (let j = 0; j < coords.length; j++) {
      xc[j] = coords[j].x;
      yc[j] = coords[j].y;
    }
    const p = (i + 1) / (numPoints + 1);
    for (let j = 1; j < coords.length; j++) {
      for (let k = 0; k < coords.length - j; k++) {
        xc[k] = xc[k] * (1 - p) + xc[k + 1] * p;
        yc[k] = yc[k] * (1 - p) + yc[k + 1] * p;
      }
    }
    result[i] = {x: xc[0], y: yc[0]};
  }
  return result;
};
