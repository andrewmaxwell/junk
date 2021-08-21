const cameraSpeed = 0.1;
const moveSpeed = 30;
const zoomSpeed = 1.001;
const movementThreshold = 1;
const zoomThreshold = 0.002;

export class Camera {
  constructor() {
    this.target = {};
    this.x = this.target.x = 0;
    this.y = this.target.y = 0;
    this.zoom = this.targetZoom = 0.6;
  }
  move(pressing) {
    if (pressing.left) this.target.x -= moveSpeed / this.zoom;
    if (pressing.right) this.target.x += moveSpeed / this.zoom;
    if (pressing.up) this.target.y -= moveSpeed / this.zoom;
    if (pressing.down) this.target.y += moveSpeed / this.zoom;

    this.x += (this.target.x - this.x) * cameraSpeed;
    this.y += (this.target.y - this.y) * cameraSpeed;
    this.zoom += (this.targetZoom - this.zoom) * cameraSpeed;

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
