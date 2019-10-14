import {pointInRect, sqDist} from './utils.js';

const distToWall = (x1, y1, x2, y2, wall) => {
  const p1 = x1 * y2 - y1 * x2;
  const p2 = wall.x1 * wall.y2 - wall.y1 * wall.x2;
  const mult =
    1 / ((x1 - x2) * (wall.y1 - wall.y2) - (y1 - y2) * (wall.x1 - wall.x2));
  const px = (p1 * (wall.x1 - wall.x2) - (x1 - x2) * p2) * mult;
  const py = (p1 * (wall.y1 - wall.y2) - (y1 - y2) * p2) * mult;
  return pointInRect(px, py, x1, y1, x2, y2) &&
    pointInRect(px, py, wall.x1, wall.y1, wall.x2, wall.y2)
    ? sqDist(x1 - px, y1 - py)
    : Infinity;
};

const distToAnyWall = (player, walls, angle) => {
  const x2 = player.x + 10000 * Math.cos(angle);
  const y2 = player.y + 10000 * Math.sin(angle);
  let min = Infinity;
  for (let i = 0; i < walls.length; i++) {
    min = Math.min(min, distToWall(player.x, player.y, x2, y2, walls[i]));
  }
  return Math.sqrt(min);
};

export const getDistances = (player, walls, params) => {
  const res = [];
  for (let i = 0; i < params.detail; i++) {
    const angle =
      player.angle + params.viewingAngle * (i / params.detail - 0.5);
    res[i] = {angle, dist: distToAnyWall(player, walls, angle)};
  }
  return res;
};
