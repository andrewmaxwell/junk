/** Number of discrete color values on the JS side. */
const NUM_COLORS = 2048;

/** Clamps a value between the given minimum and maximum. */
function clamp(value: number, minValue: number, maxValue: number): number {
  return min(max(value, minValue), maxValue);
}

/** Updates the rectangle `width` x `height`. */
export function update(width: u32, height: u32, limit: u32): void {
  const translateX = width * (1.0 / 1.6);
  const translateY = height * (1.0 / 2.0);
  const scale = 10.0 / min(3 * width, 4 * height);
  const realOffset = translateX * scale;
  const invLimit = 1.0 / limit;

  const minIterations = min(8, limit);

  for (let y: u32 = 0; y < height; ++y) {
    const imaginary = (y - translateY) * scale;
    const yOffset = (y * width) << 1;

    for (let x: u32 = 0; x < width; ++x) {
      const real = x * scale - realOffset;

      // Iterate until either the escape radius or iteration limit is exceeded
      let ix = 0.0,
        iy = 0.0,
        ixSq: f64,
        iySq: f64;
      let iteration: u32 = 0;
      while ((ixSq = ix * ix) + (iySq = iy * iy) <= 4.0) {
        iy = 2.0 * ix * iy + imaginary;
        ix = ixSq - iySq + real;
        if (iteration >= limit) break;
        ++iteration;
      }

      // Do a few extra iterations for quick escapes to reduce error margin
      while (iteration < minIterations) {
        const ixNew = ix * ix - iy * iy + real;
        iy = 2.0 * ix * iy + imaginary;
        ix = ixNew;
        ++iteration;
      }

      // Iteration count is a discrete value in the range [0, limit] here, but we'd like it to be
      // normalized in the range [0, 2047] so it maps to the gradient computed in JS.
      // see also: http://linas.org/art-gallery/escape/escape.html
      let colorIndex = NUM_COLORS - 1;
      const distanceSq = ix * ix + iy * iy;
      if (distanceSq > 1.0) {
        const fraction = Math.log2(0.5 * Math.log(distanceSq));
        colorIndex = <u32>(
          ((NUM_COLORS - 1) *
            clamp((iteration + 1 - fraction) * invLimit, 0.0, 1.0))
        );
      }
      store<u16>(yOffset + (x << 1), colorIndex);
    }
  }
}
