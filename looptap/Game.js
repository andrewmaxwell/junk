const minTargetSize = 0.5; // radians
const maxTargetSize = 1.5; // radians
const scoreMultiplier = 2000; // this number is divided by the number of ms since your last successful click (max 1)
const startSpeed = 0.03; // radians/sec
const difficulty = 0.001; // rate at which it speeds up, multiplied by your points
const missPenalty = 0.5; // your points get multiplied by this if you mess up

const inRange = (x, min, len) => x > min && x < min + len;

export class Game {
  constructor() {
    this.angle = 0;
    this.points = 0;
    this.lastSuccess = 0;
    this.best = localStorage.best || 0;
    this.history = [];
    this.next();
  }
  next() {
    this.targetStart = Math.random() * Math.PI * 2;
    this.targetLen =
      minTargetSize + Math.random() * (maxTargetSize - minTargetSize);
  }
  tick() {
    this.angle =
      (this.angle + startSpeed + this.points * difficulty) % (Math.PI * 2);
    this.history.push(this.points);
  }
  click() {
    if (
      inRange(this.angle, this.targetStart, this.targetLen) ||
      inRange(this.angle + 2 * Math.PI, this.targetStart, this.targetLen)
    ) {
      this.points += Math.max(
        1,
        Math.round(scoreMultiplier / (Date.now() - this.lastSuccess))
      );
      this.fail = null;
      this.lastSuccess = Date.now();
      localStorage.best = this.best = Math.max(this.best, this.points);
      this.next();
    } else {
      this.fail = this.angle;
      this.points = Math.floor(this.points * missPenalty);
      this.lastSuccess = 0;
    }
  }
}
