export class Roomba {
  constructor(room, moveFunc) {
    this.speed = 5;
    this.rad = 20;
    this.x = this.rad + Math.random() * (room.width - 2 * this.rad);
    this.y = this.rad + Math.random() * (room.height - 2 * this.rad);
    this.angle = Math.random() * 2 * Math.PI;
    this.moveFunc = moveFunc;
    this.data = {};
    this.resolveCollisions(room);
  }
  resolveCollisions({width, height, obstacles}) {
    const origX = this.x;
    const origY = this.y;

    for (const {x, y, rad} of obstacles) {
      const dx = this.x - x;
      const dy = this.y - y;
      if (dx * dx + dy * dy < (rad + this.rad) ** 2) {
        const amt = (rad + this.rad) / Math.hypot(dx, dy) - 1;
        this.x += dx * amt;
        this.y += dy * amt;
      }
    }

    this.x = Math.max(this.rad, Math.min(width - this.rad, this.x));
    this.y = Math.max(this.rad, Math.min(height - this.rad, this.y));

    return this.x !== origX || this.y !== origY;
  }
  move(room) {
    room.clean(this);
    if (this.moveFunc) {
      const api = {
        isColliding: this.isColliding,
        x: this.x,
        y: this.y,
        data: this.data,
        setTurn: (amt) => (this.angle += amt),
      };
      this.moveFunc(api);
    }
    this.x += this.speed * Math.cos(this.angle);
    this.y += this.speed * Math.sin(this.angle);
    this.isColliding = this.resolveCollisions(room);
  }
}

export const makeFunction = (code) =>
  new Function('{isColliding, setTurn, x, y, data}', code);
