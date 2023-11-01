export class Grid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.arr = new Float32Array(width * height * 2);
    this.imageData = new ImageData(width, height);
    for (let i = 3; i < this.imageData.data.length; i += 4) {
      this.imageData.data[i] = 255;
    }
  }
  get(x, y) {
    const i = 2 * (y * this.width + x);
    return {a: this.arr[i], b: this.arr[i + 1]};
  }
  set(x, y, a, b) {
    const i = 2 * (y * this.width + x);
    this.arr[i] = a;
    this.arr[i + 1] = b;
  }
  toImageData() {
    const {width, height, arr, imageData} = this;
    for (let i = 0; i < width * height; i++) {
      // imageData.data[4 * i + 2] = arr[2 * i] * 255;
      // imageData.data[4 * i + 1] = arr[2 * i + 1] * 255;
      imageData.data[4 * i + 1] = (1 + arr[2 * i + 1] - arr[2 * i]) * 128;
    }
    return imageData;
  }
}
