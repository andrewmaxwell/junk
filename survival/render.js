import {Food} from './Food.js';

const drawPaths = (ctx, params, cows) => {
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = 'black';
  ctx.beginPath();
  for (const {path} of cows) {
    if (!path.length) continue;
    ctx.moveTo(path[0].x, path[0].y);
    for (const {x, y} of path) ctx.lineTo(x, y);
  }
  ctx.stroke();
};

const drawFood = (ctx, params, food) => {
  ctx.fillStyle = 'lightgreen';
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (const {x, y} of food) {
    ctx.moveTo(x + params.foodRad, y);
    ctx.arc(x, y, params.foodRad, 0, 2 * Math.PI);
  }
  ctx.fill();
};

const drawCows = (ctx, params, cows) => {
  let oldest;
  ctx.fillStyle = 'red';
  for (const item of cows) {
    ctx.drawImage(
      item.image,
      item.x - params.agentRad,
      item.y - params.agentRad
    );
    if (!oldest || item.age > oldest.age) oldest = item;
  }

  // if (oldest) {
  //   ctx.globalAlpha = 1;
  //   for (let i = 0; i < oldest.inputs.length; i++) {
  //     if (oldest.inputs[i] === 1) continue;
  //     ctx.strokeStyle = i % 2 ? 'red' : 'green';
  //     ctx.beginPath();
  //     ctx.arc(
  //       oldest.x,
  //       oldest.y,
  //       oldest.inputs[i] * params.sightDistance,
  //       (Math.floor(i / 2) / params.numSightDirs) * 2 * Math.PI + oldest.angle,
  //       (Math.floor(i / 2 + 1) / params.numSightDirs) * 2 * Math.PI + oldest.angle
  //     );
  //     ctx.stroke();
  //   }
  // }
};

export const render = (ctx, params, hashGrid) => {
  const cows = [];
  const food = [];
  for (const item of hashGrid.getAll()) {
    (item instanceof Food ? food : cows).push(item);
  }

  drawPaths(ctx, params, cows);
  drawFood(ctx, params, food);
  drawCows(ctx, params, cows);
};
