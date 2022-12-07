export class Room {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.obstacles = [];
    for (let i = 0; i < 16; i++) {
      this.obstacles[i] = {
        x: Math.random() * width,
        y: Math.random() * height,
        rad: 10 + Math.random() * 50,
      };
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#88F';
    ctx.beginPath();
    for (const {x, y, rad} of this.obstacles) {
      ctx.moveTo(x + rad, y);
      ctx.arc(x, y, rad, 0, 2 * Math.PI);
    }
    ctx.fill();

    this.trailMap = ctx.getImageData(0, 0, this.width, this.height);
    this.startingDirty = this.getDirty();
  }
  getDirty() {
    const {trailMap} = this;
    let result = 0;
    for (let i = 3; i < trailMap.data.length; i += 4) {
      result += trailMap.data[i] === 0;
    }
    return result;
  }
  clean({x, y, rad}) {
    const {width, height, trailMap} = this;
    const minX = Math.max(0, Math.round(x - rad));
    const maxX = Math.min(width - 1, Math.round(x + rad));
    const minY = Math.max(0, Math.round(y - rad));
    const maxY = Math.min(height - 1, Math.round(y + rad));
    for (let i = minX; i <= maxX; i++) {
      for (let j = minY; j <= maxY; j++) {
        if ((i - x) ** 2 + (j - y) ** 2 > rad * rad) continue;
        const k = 4 * (j * width + i);
        trailMap.data[k + 1] = 255;
        trailMap.data[k + 3] += 50;
      }
    }
  }
  getPercentClean() {
    return 100 * (1 - this.getDirty() / this.startingDirty);
  }
}
