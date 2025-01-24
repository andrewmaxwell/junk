import {makeRenderer} from './makeRenderer.js';
import {makeSolver} from './makeSolver.js';

const scenario = {
  width: 7,
  height: 7,
  centers: [
    {x: 6, y: 0},
    {x: 2, y: 0.5},
    {x: 6, y: 6},
    {x: 0, y: 1.5},
    {x: 4.5, y: 2.5},
    {x: 1, y: 5},
    {x: 0.5, y: 6},
    {x: 4, y: 6},
    {x: 5, y: 0.5},
    {x: 6, y: 2.5},
    {x: 4, y: 4.5},
    {x: 3, y: 4},
    {x: 1.5, y: 3},
  ],
};

const renderer = makeRenderer(scenario);
const solver = makeSolver(scenario);

const loop = () => {
  renderer.render(solver.grid);
  // const solved = solver.iterate();
  // if (!solved) requestAnimationFrame(loop);
};

loop();
