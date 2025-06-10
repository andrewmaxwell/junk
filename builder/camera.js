const cameraSpeed = 0.01;
const moveSpeed = 200;
const zoomSpeed = 1.001;
const movementThreshold = 1;
const zoomThreshold = 0.002;

let lastTime = 0;

export class Camera {
  constructor(initialView = {}) {
    this.target = {};
    this.x = this.target.x = initialView.x ?? 0;
    this.y = this.target.y = initialView.y ?? 0;
    this.zoom = this.targetZoom = initialView.zoom ?? 0.6;
  }
  move(pressing) {
    const now = performance.now();
    const amt = cameraSpeed * Math.min(50, now - lastTime);
    lastTime = now;

    if (pressing.left) this.target.x -= (moveSpeed / this.zoom) * amt;
    if (pressing.right) this.target.x += (moveSpeed / this.zoom) * amt;
    if (pressing.up) this.target.y -= (moveSpeed / this.zoom) * amt;
    if (pressing.down) this.target.y += (moveSpeed / this.zoom) * amt;

    this.x += (this.target.x - this.x) * amt;
    this.y += (this.target.y - this.y) * amt;
    this.zoom += (this.targetZoom - this.zoom) * amt;

    if (
      Math.abs(this.x - this.target.x) * this.zoom > movementThreshold ||
      Math.abs(this.y - this.target.y) * this.zoom > movementThreshold ||
      Math.abs(this.zoom - this.targetZoom) > zoomThreshold
    ) {
      return true;
    } else {
      this.x = this.target.x;
      this.y = this.target.y;
      this.zoom = this.targetZoom;
      return false;
    }
  }
  changeZoom(amt) {
    this.targetZoom *= Math.pow(zoomSpeed, amt);
  }
  toWorldCoords(x, y) {
    return {
      x: (x - innerWidth / 2) / this.zoom + this.x,
      y: (y - innerHeight / 2) / this.zoom + this.y,
    };
  }
  transform(ctx) {
    ctx.translate(innerWidth / 2, innerHeight / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
  isVisible(x, y) {
    x = ((x - this.x) * this.zoom) / innerWidth;
    y = ((y - this.y) * this.zoom) / innerHeight;
    return x >= -0.5 && x < 0.5 && y >= -0.5 && y < 0.5;
  }
  save() {
    return (
      Math.round(this.target.x) +
      '_' +
      Math.round(this.target.y) +
      '_' +
      this.targetZoom.toFixed(2)
    );
  }
  load(str) {
    var parts = str.split('_').map(parseFloat);
    this.target.x = parts[0] && !isNaN(parts[0]) ? parts[0] : 0;
    this.target.y = parts[1] && !isNaN(parts[1]) ? parts[1] : 0;
    this.targetZoom = parts[2] && !isNaN(parts[2]) ? parts[2] : 0.6;
  }
}
