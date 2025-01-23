import {viewer} from '../primeSpiral/viewer.js';
import {Cow} from './Cow.js';
import {addFood} from './Food.js';
import {render} from './render.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';

const params = {
  energyUse: 0.0002,
  mutationRate: 0.01,
  sightDistance: 100,
  speedMult: 4,
  agentRad: 16,
  newFoodRate: 0.01,
  foodEnergy: 0.1,
  foodRad: 8,
  foodSpreadProb: 0.01,
  pathLength: 200,
  fastForward: false,
};

const randCoord = (rad = 600) => {
  while (true) {
    const x = (Math.random() * 2 - 1) * rad;
    const y = (Math.random() * 2 - 1) * rad;
    if (Math.hypot(x, y) < rad) return [x, y];
  }
};

let hashGrid,
  frameCounter = 0;

const reset = () => {
  frameCounter = 0;
  hashGrid = new SpatialHashGrid();
  for (let i = 0; i < 100; i++) {
    hashGrid.insert(new Cow(params, ...randCoord()));
    addFood(hashGrid, params, ...randCoord());
  }
};

const iterate = () => {
  for (const item of hashGrid.getAll()) {
    item.act(hashGrid, params);
  }
  if (Math.random() < params.newFoodRate) {
    addFood(hashGrid, params, ...randCoord());
  }
  frameCounter++;
};

reset();

viewer(
  (ctx) => {
    iterate();
    if (params.fastForward) {
      const start = performance.now();
      while (performance.now() - start < 1000) iterate();
    }
    render(ctx, params, hashGrid);
  },
  {
    onClick: ({x, y}) => hashGrid.insert(new Cow(params, x, y)),
    drawStatic: (ctx) => {
      ctx.fillStyle = 'black';
      ctx.fillText(frameCounter.toLocaleString() + ' iterations', 3, 10);
    },
  }
);

const gui = new window.dat.GUI();
gui.add(params, 'energyUse', 0, 0.004);
gui.add(params, 'mutationRate', 0, 1);
gui.add(params, 'sightDistance', 10, 200);
gui.add(params, 'speedMult', 1, 10);
gui.add(params, 'agentRad', 2, 30).onChange(() => {
  for (const item of hashGrid.getAll()) {
    item.updateImage?.(params);
  }
});
gui.add(params, 'newFoodRate', 0, 1);
gui.add(params, 'foodSpreadProb', 0, 0.1);
gui.add(params, 'foodEnergy', 0, 1);
gui.add(params, 'foodRad', 2, 30);
gui.add(params, 'pathLength', 0, 500);
gui.add(params, 'fastForward');
