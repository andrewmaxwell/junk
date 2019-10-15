const rand = (min, max) => min + Math.random() * (max - min);

const pointInRect = (x, y, x1, y1, x2, y2) =>
  Math.abs(x - (x1 + x2) / 2) * 2 <= Math.abs(x1 - x2) &&
  Math.abs(y - (y1 + y2) / 2) * 2 <= Math.abs(y1 - y2);

const getIntersection = (x1, y1, x2, y2, wall) => {
  const p1 = x1 * y2 - y1 * x2;
  const p2 = wall.x1 * wall.y2 - wall.y1 * wall.x2;
  const mult =
    1 / ((x1 - x2) * (wall.y1 - wall.y2) - (y1 - y2) * (wall.x1 - wall.x2));
  const x = (p1 * (wall.x1 - wall.x2) - (x1 - x2) * p2) * mult;
  const y = (p1 * (wall.y1 - wall.y2) - (y1 - y2) * p2) * mult;
  const dist =
    pointInRect(x, y, x1, y1, x2, y2) &&
    pointInRect(x, y, wall.x1, wall.y1, wall.x2, wall.y2)
      ? Math.hypot(x1 - x, y1 - y)
      : Infinity;
  return {x, y, dist};
};

const distToAnyWall = (x1, y1, x2, y2, walls) => {
  let min = {x: 0, y: 0, dist: Infinity};
  for (let i = 0; i < walls.length; i++) {
    const intersection = getIntersection(x1, y1, x2, y2, walls[i]);
    if (intersection.dist < min.dist) min = intersection;
  }
  return min;
};

export class World {
  reset(width, height) {
    // four walls around area
    this.walls = [
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
      this.walls.push({
        x1: rand(wallMargin, width - wallMargin),
        y1: rand(wallMargin, height - wallMargin),
        x2: rand(wallMargin, width - wallMargin),
        y2: rand(wallMargin, height - wallMargin)
      });
    }

    this.player = {
      x: wallMargin,
      y: wallMargin,
      angle: Math.PI / 4,
      move: (speed, walls) => {
        const {player} = this;
        const nx = player.x + speed * Math.cos(player.angle);
        const ny = player.y + speed * Math.sin(player.angle);
        const {dist} = distToAnyWall(player.x, player.y, nx, ny, walls);
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
    const {player, walls} = this;
    if (pressing.ArrowUp) player.move(params.moveSpeed, walls);
    if (pressing.ArrowDown) player.move(-params.moveSpeed, walls);
    if (pressing.ArrowLeft) player.turn(-params.turnSpeed);
    if (pressing.ArrowRight) player.turn(params.turnSpeed);
  }
  getDistances(params) {
    const {player, walls} = this;
    const res = [];
    for (let i = 0; i < params.detail; i++) {
      const angle =
        player.angle + params.viewingAngle * (i / params.detail - 0.5);
      const x2 = player.x + params.renderDist * Math.cos(angle);
      const y2 = player.y + params.renderDist * Math.sin(angle);
      res[i] = {...distToAnyWall(player.x, player.y, x2, y2, walls), angle};
    }
    return res;
  }
}
