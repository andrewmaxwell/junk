const canvas = document.querySelector('canvas');
const width = (canvas.width = 800);
const height = (canvas.height = 600);
const ctx = canvas.getContext('2d');

let walls, player;
const wallMargin = 50;
const lines = 100;
const viewingAngle = Math.PI / 3;

const rand = (min, max) => min + Math.random() * (max - min);

const pointInRect = (x, y, x1, y1, x2, y2) =>
  Math.abs(x - (x1 + x2) / 2) * 2 <= Math.abs(x1 - x2) &&
  Math.abs(y - (y1 + y2) / 2) * 2 <= Math.abs(y1 - y2);

const distToWall = (x1, y1, x2, y2, {x1: x3, y1: y3, x2: x4, y2: y4}) => {
  const p1 = x1 * y2 - y1 * x2;
  const p2 = x3 * y4 - y3 * x4;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  const px = (p1 * (x3 - x4) - (x1 - x2) * p2) / den;
  const py = (p1 * (y3 - y4) - (y1 - y2) * p2) / den;
  return pointInRect(px, py, x1, y1, x2, y2) &&
    pointInRect(px, py, x3, y3, x4, y4)
    ? Math.hypot(x1 - px, y1 - py)
    : Infinity;
};

const distToAnyWall = (x1, y1, x2, y2, walls) => {
  let min = Infinity;
  for (let i = 0; i < walls.length; i++) {
    min = Math.min(min, distToWall(x1, y1, x2, y2, walls[i]));
  }
  return min;
};

const drawWalls = (ctx, walls) => {
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  walls.forEach(({x1, y1, x2, y2}) => {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  });
  ctx.stroke();
};

const drawPlayer = (ctx, {x, y, angle}) => {
  ctx.fillStyle = 'red';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(10, 10);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.lineTo(2, 0);
  ctx.lineTo(0, 0.5);
  ctx.lineTo(0, -0.5);
  ctx.fill();
  ctx.restore();
};

const getDistances = (player, walls) => {
  const res = [];
  for (let i = 0; i < lines; i++) {
    const angle = player.angle - viewingAngle * (i / lines - 0.5);
    res[i] = {
      angle,
      dist: distToAnyWall(
        player.x,
        player.y,
        player.x + width * Math.cos(angle),
        player.y + width * Math.sin(angle),
        walls
      )
    };
  }
  return res;
};

const drawTopDownDistances = (ctx, player, distances) => {
  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  distances.forEach(({angle, dist}) => {
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(
      player.x + dist * Math.cos(angle),
      player.y + dist * Math.sin(angle)
    );
  });
  ctx.stroke();
};

const drawFirstPerson = (ctx, distances) => {
  ctx.fillStyle = 'black';
  ctx.beginPath();
  distances.forEach(({dist}, i) => {
    const h = 10000 / dist;
    ctx.globalAlpha = Math.min(1, 5 / Math.sqrt(dist));
    ctx.fillRect(
      width - (i / lines) * width, // flip it?
      height / 2 - h,
      width / lines,
      h * 2
    );
  });
  ctx.stroke();
};

const reset = () => {
  walls = [
    {x1: 0, y1: 0, x2: width, y2: 0},
    {x1: width, y1: 0, x2: width, y2: height},
    {x1: width, y1: height, x2: 0, y2: height},
    {x1: 0, y1: height, x2: 0, y2: 0}
  ].map(w => {
    // for some reason, it works best when angles aren't perfectly square?
    w.x1 += Math.random() / 100;
    w.y1 += Math.random() / 100;
    return w;
  });

  for (let i = 0; i < 20; i++) {
    walls.push({
      x1: rand(wallMargin, width - wallMargin),
      y1: rand(wallMargin, height - wallMargin),
      x2: rand(wallMargin, width - wallMargin),
      y2: rand(wallMargin, height - wallMargin)
    });
  }

  player = {
    x: wallMargin,
    y: wallMargin,
    angle: 0,
    speed: 3,
    turnSpeed: 0.07
  };
};

const loop = () => {
  requestAnimationFrame(loop);

  if (pressing.ArrowUp) {
    player.x += player.speed * Math.cos(player.angle);
    player.y += player.speed * Math.sin(player.angle);
  }
  if (pressing.ArrowDown) {
    player.x -= player.speed * Math.cos(player.angle);
    player.y -= player.speed * Math.sin(player.angle);
  }
  if (pressing.ArrowLeft) {
    player.angle -= player.turnSpeed;
  }
  if (pressing.ArrowRight) {
    player.angle += player.turnSpeed;
  }

  const distances = getDistances(player, walls);

  ctx.clearRect(0, 0, width, height);
  drawTopDownDistances(ctx, player, distances);
  drawFirstPerson(ctx, distances);
  drawWalls(ctx, walls);
  drawPlayer(ctx, player);
};

const pressing = {};
window.onkeydown = window.onkeyup = e => {
  pressing[e.key] = e.type === 'keydown';
};

reset();
loop();
