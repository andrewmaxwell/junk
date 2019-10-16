const rand = (min, max) => min + Math.random() * (max - min);

const pointInRect = (x, y, x1, y1, x2, y2) =>
  Math.abs(x - (x1 + x2) / 2) * 2 <= Math.abs(x1 - x2) &&
  Math.abs(y - (y1 + y2) / 2) * 2 <= Math.abs(y1 - y2);

const distanceToLineSegment = (x1, y1, x2, y2, line) => {
  const p1 = x1 * y2 - y1 * x2;
  const p2 = line.x1 * line.y2 - line.y1 * line.x2;
  const mult =
    1 / ((x1 - x2) * (line.y1 - line.y2) - (y1 - y2) * (line.x1 - line.x2));
  const x = (p1 * (line.x1 - line.x2) - (x1 - x2) * p2) * mult;
  const y = (p1 * (line.y1 - line.y2) - (y1 - y2) * p2) * mult;
  return pointInRect(x, y, x1, y1, x2, y2) &&
    pointInRect(x, y, line.x1, line.y1, line.x2, line.y2)
    ? Math.hypot(x1 - x, y1 - y)
    : Infinity;
};

function distanceToCircle(x1, y1, x2, y2, circle) {
  const v1x = x2 - x1;
  const v1y = y2 - y1;
  const v2x = x1 - circle.x;
  const v2y = y1 - circle.y;
  const b = -2 * (v1x * v2x + v1y * v2y);
  const c = v1x ** 2 + v1y ** 2;
  const d = Math.sqrt(
    b ** 2 - 4 * c * (v2x ** 2 + v2y ** 2 - circle.radius ** 2)
  );
  if (isNaN(d)) return Infinity;
  const u1 = (b - d) / c / 2;
  const u2 = (b + d) / c / 2;
  return Math.min(
    u1 <= 1 && u1 >= 0 ? u1 * Math.sqrt(c) : Infinity,
    u2 <= 1 && u2 >= 0 ? u2 * Math.sqrt(c) : Infinity
  );
}

const distanceToThing = (x1, y1, x2, y2, thing) =>
  thing.radius
    ? distanceToCircle(x1, y1, x2, y2, thing)
    : distanceToLineSegment(x1, y1, x2, y2, thing);

const distToAnything = (x1, y1, x2, y2, things) => {
  let min = Infinity;
  for (let i = 0; i < things.length; i++) {
    min = Math.min(min, distanceToThing(x1, y1, x2, y2, things[i]));
  }
  return min;
};

export class World {
  reset(width, height) {
    // four walls around area
    this.things = [
      {x1: 0, y1: 0, x2: width, y2: 0},
      {x1: width, y1: 0, x2: width, y2: height},
      {x1: width, y1: height, x2: 0, y2: height},
      {x1: 0, y1: height, x2: 0, y2: 0}
    ].map(w => {
      // for some reason, it works best when angles aren't perfectly square?
      w.x1 -= Math.random() / 1000;
      w.y1 += Math.random() / 1000;
      return w;
    });

    const wallMargin = 50;
    for (let i = 0; i < 20; i++) {
      this.things.push({
        x1: rand(wallMargin, width - wallMargin),
        y1: rand(wallMargin, height - wallMargin),
        x2: rand(wallMargin, width - wallMargin),
        y2: rand(wallMargin, height - wallMargin)
      });
    }

    for (let i = 0; i < 10; i++) {
      this.things.push({
        x: rand(wallMargin, width - wallMargin),
        y: rand(wallMargin, height - wallMargin),
        radius: rand(3, wallMargin / 2)
      });
    }

    this.player = {
      x: wallMargin,
      y: wallMargin,
      angle: Math.PI / 4,
      move: (speed, things, {walkThroughWalls}) => {
        const {player} = this;
        const nx = player.x + speed * Math.cos(player.angle);
        const ny = player.y + speed * Math.sin(player.angle);
        const dist = walkThroughWalls
          ? Infinity
          : distToAnything(player.x, player.y, nx, ny, things);
        if (dist === Infinity) {
          player.x = nx;
          player.y = ny;
        }
      },
      turn: speed => {
        this.player.angle += speed;
      }
    };
  }
  iterate(pressing, params) {
    const {player, things} = this;
    if (pressing.ArrowUp) player.move(params.moveSpeed, things, params);
    if (pressing.ArrowDown) player.move(-params.moveSpeed, things, params);
    if (pressing.ArrowLeft) player.turn(-params.turnSpeed);
    if (pressing.ArrowRight) player.turn(params.turnSpeed);
  }
  getDistances(params) {
    const {player, things} = this;
    const res = [];
    for (let i = 0; i < params.detail; i++) {
      const angle =
        player.angle + params.viewingAngle * (i / params.detail - 0.5);
      const x2 = player.x + params.renderDist * Math.cos(angle);
      const y2 = player.y + params.renderDist * Math.sin(angle);
      res[i] = {
        dist: distToAnything(player.x, player.y, x2, y2, things),
        angle
      };
    }
    return res;
  }
}
