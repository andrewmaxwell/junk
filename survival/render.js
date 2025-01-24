import {Food} from './Food.js';

const drawPaths = (ctx, params, agents) => {
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = 'black';
  ctx.beginPath();
  for (const {path} of agents) {
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

const drawAgents = (ctx, params, agents) => {
  let oldest;
  ctx.fillStyle = 'red';
  for (const item of agents) {
    ctx.globalAlpha = item.energy;
    ctx.drawImage(
      item.image,
      item.x - params.agentRad,
      item.y - params.agentRad
    );
    if (!oldest || item.age > oldest.age) oldest = item;
  }
  ctx.globalAlpha = 1;

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
  const agents = [];
  const food = [];
  for (const item of hashGrid.getAll()) {
    (item instanceof Food ? food : agents).push(item);
  }

  drawPaths(ctx, params, agents);
  drawFood(ctx, params, food);
  drawAgents(ctx, params, agents);
};
