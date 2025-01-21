import {viewer} from '../primeSpiral/viewer.js';
import {Cow} from './Cow.js';
import {Food} from './Food.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';

const params = {
  energyUse: 0.0002,
  mutationRate: 0.05,
  visionRadius: 100,
  numBins: 8,
  speedMult: 4,
  newFoodRate: 0.5,
  foodEnergy: 0.1,
  foodRad: 10,
  cowRad: 10,
  pathLength: 200,
};

let hashGrid;

const rand = (rad = 600) => {
  while (true) {
    const x = (Math.random() * 2 - 1) * rad;
    const y = (Math.random() * 2 - 1) * rad;
    if (Math.hypot(x, y) < rad) return [x, y];
  }
};

const reset = () => {
  hashGrid = new SpatialHashGrid();
  for (let i = 0; i < 100; i++) {
    hashGrid.insert(new Cow(params, ...rand()));
    hashGrid.insert(new Food(params, ...rand()));
  }
};

const iterate = () => {
  for (const item of hashGrid.getAll()) {
    const newItem = item.act(hashGrid, params);
    if (newItem) hashGrid.insert(newItem);
    if (item.energy <= 0) hashGrid.remove(item);
  }

  if (Math.random() < params.newFoodRate) {
    hashGrid.insert(new Food(params, ...rand()));
  }
};

reset();

// const nnWidth = 300;
// const nnHeight = 300;
// const margin = 30;
// const drawStatic = (ctx) => {
//   if (!first) return;
//   const {nn} = first;
//   ctx.textAlign = 'center';
//   ctx.textBaseline = 'middle';
//   for (let i = 0; i < nn.length; i++) {
//     const x = innerWidth - nnWidth + (nnWidth - margin) * (i / (nn.length - 1));
//     for (let j = 0; j < nn[i].values.length; j++) {
//       const y =
//         innerHeight -
//         nnHeight +
//         (nnHeight - margin) * (j / (nn[i].values.length - 1));
//       ctx.fillStyle = '#88888866';
//       ctx.beginPath();
//       ctx.arc(x, y, 10, 0, 2 * Math.PI);
//       ctx.fill();

//       if (nn[i].biases) {
//         ctx.fillStyle = 'black';
//         ctx.fillText(nn[i].biases[j].toFixed(3), x, y);
//       }
//     }
//   }
// };

viewer((ctx) => {
  iterate();

  // draw paths
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  for (const item of hashGrid.getAll()) {
    if (!item.path?.length) continue;
    ctx.moveTo(item.path[0].x, item.path[0].y);
    for (const {x, y} of item.path) ctx.lineTo(x, y);
  }
  ctx.stroke();

  // draw food
  ctx.fillStyle = 'green';
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (const item of hashGrid.getAll()) {
    if (!(item instanceof Food)) continue;
    ctx.moveTo(item.x + params.foodRad, item.y);
    ctx.arc(item.x, item.y, params.foodRad, 0, 2 * Math.PI);
  }
  ctx.fill();

  // draw cows
  ctx.fillStyle = 'red';
  for (const item of hashGrid.getAll()) {
    if (!(item instanceof Cow)) continue;
    ctx.globalAlpha = Math.min(1, item.energy);
    ctx.beginPath();
    ctx.arc(item.x, item.y, params.cowRad, 0, 2 * Math.PI);
    ctx.fill();
  }
});

const gui = new window.dat.GUI();
gui.add(params, 'energyUse', 0, 0.004);
gui.add(params, 'mutationRate', 0, 1);
gui.add(params, 'visionRadius', 10, 200);
gui.add(params, 'numBins', 2, 16, 1).onChange(reset);
gui.add(params, 'speedMult', 1, 10);
gui.add(params, 'newFoodRate', 0, 1);
gui.add(params, 'foodEnergy', 0, 1);
gui.add(params, 'foodRad', 2, 30);
gui.add(params, 'cowRad', 2, 30);
