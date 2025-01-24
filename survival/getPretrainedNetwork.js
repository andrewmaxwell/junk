import {Agent} from './Agent.js';
import {Food} from './Food.js';
import {train} from './nn.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';

export const getPretrainedNetwork = (params) => {
  const hashGrid = new SpatialHashGrid();

  const agent = new Agent(params, 0, 0);
  agent.angle = 0;

  const closeFood = hashGrid.insert(new Food(params, 0, 0));

  for (let i = 0; i < 10000; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const foodDist = Math.random() * params.sightDistance;
    const x = foodDist * Math.cos(angle);
    const y = foodDist * Math.sin(angle);
    hashGrid.update(closeFood, x, y);

    const {inputs} = agent.lookAround(hashGrid, params);
    const input = [Math.random(), ...inputs]; // make energy level random

    const fraction = (0.5 - angle / (2 * Math.PI)) % 1;
    const expected = [fraction + (fraction < 0 ? 1 : 0)];

    train(agent.nn, input, expected);
  }

  return agent.nn;
};
