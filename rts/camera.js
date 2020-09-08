const cameraSpeed = 0.1;
const moveSpeed = 30;
const zoomSpeed = 1.001;
const movementThreshold = 1;
const zoomThreshold = 0.002;

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.target = {...this};
  }
  move({pressing}) {
    const amt = moveSpeed / this.zoom;
    if (pressing.KeyA) this.target.x -= amt;
    if (pressing.KeyD) this.target.x += amt;
    if (pressing.KeyW) this.target.y -= amt;
    if (pressing.KeyS) this.target.y += amt;

    this.x += (this.target.x - this.x) * cameraSpeed;
    this.y += (this.target.y - this.y) * cameraSpeed;
    this.zoom += (this.target.zoom - this.zoom) * cameraSpeed;

    if (
      Math.abs(this.x - this.target.x) * this.zoom > movementThreshold ||
      Math.abs(this.y - this.target.y) * this.zoom > movementThreshold ||
      Math.abs(this.zoom - this.target.zoom) > zoomThreshold
    ) {
      return true;
    } else {
      this.x = this.target.x;
      this.y = this.target.y;
      this.zoom = this.target.zoom;
      return false;
    }
  }
  changeZoom(amt, x, y) {
    const {target: t} = this;
    const mult = zoomSpeed ** amt;
    t.x += ((x - innerWidth / 2) / t.zoom) * (1 - 1 / mult);
    t.y += ((y - innerHeight / 2) / t.zoom) * (1 - 1 / mult);
    t.zoom *= mult;
  }
  toWorldCoords(x, y) {
    return {
      x: (x - innerWidth / 2) / this.zoom + this.x,
      y: (y - innerHeight / 2) / this.zoom + this.y,
    };
  }
}
