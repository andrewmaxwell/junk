const groundColor = [41, 38, 34];

export class Ground {
  constructor(width, height, groundLevel) {
    this.width = width;
    this.height = height;
    this.maxDepth = 0;
    this.groundLevel = groundLevel;

    this.imageData = new ImageData(width, height);
    const d = this.imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      [d[i], d[i + 1], d[i + 2]] = groundColor;
      d[i + 3] = 255;
    }
  }
  isTouching(x, oy, rad) {
    const {imageData, width, height, groundLevel} = this;
    const d = imageData.data;
    const y = oy - groundLevel;
    const minX = Math.max(0, Math.floor(x - rad));
    const maxX = Math.min(width - 1, Math.ceil(x + rad));
    const minY = Math.max(0, Math.floor(y - rad));
    const maxY = Math.min(height - 1, Math.ceil(y + rad));
    for (let i = minY; i < maxY; i++) {
      for (let j = minX; j < maxX; j++) {
        if (
          (i - y) ** 2 + (j - x) ** 2 < rad ** 2 &&
          d[4 * (i * width + j) + 3] > 0
        )
          return true;
      }
    }
    return false;
  }
  destroy(x, oy, rad) {
    const {imageData, width, height, groundLevel} = this;
    const d = imageData.data;
    const y = oy - groundLevel;
    const minX = Math.max(0, Math.floor(x - rad));
    const maxX = Math.min(width - 1, Math.ceil(x + rad));
    const minY = Math.max(0, Math.floor(y - rad));
    const maxY = Math.min(height - 1, Math.ceil(y + rad));
    for (let i = minY; i < maxY; i++) {
      for (let j = minX; j < maxX; j++) {
        if ((i - y) ** 2 + (j - x) ** 2 < rad ** 2) {
          d[4 * (i * width + j) + 3] = 0;
        }
      }
    }
    this.maxDepth = Math.max(this.maxDepth, maxY);
  }
}
