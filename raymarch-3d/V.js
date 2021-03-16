export class V {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  copy() {
    return new V(this.x, this.y, this.z);
  }
  add(b) {
    return new V(this.x + b.x, this.y + b.y, this.z + b.z);
  }
  addM(b) {
    this.x += b.x;
    this.y += b.y;
    this.z += b.z;
    return this;
  }
  scale(f) {
    return new V(this.x * f, this.y * f, this.z * f);
  }
  scaleM(f) {
    this.x *= f;
    this.y *= f;
    this.z *= f;
    return this;
  }
  dotProduct(b) {
    return this.x * b.x + this.y * b.y + this.z * b.z;
  }
  crossProduct(b) {
    return new V(
      this.y * b.z - this.z * b.y,
      this.z * b.x - this.x * b.z,
      this.x * b.y - this.y * b.x
    );
  }
  normalize() {
    return this.scaleM(1 / Math.hypot(this.x, this.y, this.z));
  }
  subtract(b) {
    return new V(this.x - b.x, this.y - b.y, this.z - b.z);
  }
  subtractM(b) {
    this.x -= b.x;
    this.y -= b.y;
    this.z -= b.z;
    return this;
  }
  dist(b) {
    return Math.sqrt(
      (this.x - b.x) ** 2 + (this.y - b.y) ** 2 + (this.z - b.z) ** 2
    );
  }
  eachM(func) {
    this.x = func(this.x);
    this.y = func(this.y);
    this.z = func(this.z);
    return this;
  }
}
