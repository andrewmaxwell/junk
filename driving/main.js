import {DQNAgent} from './DQNAgent.js';
import {makeRenderer} from './makeRenderer.js';
import {makeSim} from './makeSim.js';

const params = {
  carRadius: 20,
  carAcceleration: 0.1,
  carTurnSpeed: 0.05,
  carFov: Math.PI * 2,
  carDrag: 0.98,
  width: 1200,
  height: 500,
  minObstacleRad: 5,
  maxObstacleRad: 30,
  numObstacles: 30,
  numRays: 100,
  maxFrames: 300,
};

// const render = makeRenderer(params);
// const sim = makeSim(params);

// const loop = () => {
//   sim.iterate();
//   render(sim.state);
//   requestAnimationFrame(loop);
// };

// loop();

// const codeLookup = {
//   ArrowUp: 'up',
//   ArrowDown: 'down',
//   ArrowLeft: 'left',
//   ArrowRight: 'right',
//   KeyW: 'up',
//   KeyA: 'left',
//   KeyS: 'down',
//   KeyD: 'right',
// };
// onkeyup = onkeydown = (e) => {
//   if (!codeLookup[e.code]) return;
//   sim.setPressing(codeLookup[e.code], e.type === 'keydown');
// };

const toAgentState = ({car, goal, rays, goalDist}) => [
  car.speed,
  goalDist,
  ((Math.atan2(goal.y - car.y, goal.x - car.x) - car.angle + Math.PI) %
    (2 * Math.PI)) -
    Math.PI, // angle to goal
  ...rays.map((r) => r.dist), // ray distances
];

const calcReward = ({goalDist, frame}) => {
  // reach goal instantly: 1
  // reach goal in maxFrames: 0
  // get further away from goal: -1
  if (goalDist <= 0) return 1 - frame / params.maxFrames;
  return -goalDist / params.width;
};

const render = makeRenderer(params);

let sim;
const resetEnvironment = () => {
  sim = makeSim(params);
  sim.iterate();
  return toAgentState(sim.state);
};

const stepEnvironment = (actionIndex) => {
  const turn = Math.floor(actionIndex / 3);
  const speed = actionIndex % 3;
  sim.iterate(speed === 0, speed === 1, turn === 0, turn === 1);
  render(sim.state);
  return {
    nextInputs: toAgentState(sim.state),
    done: sim.state.done,
    reward: calcReward(sim.state),
  };
};

const agent = new DQNAgent(params.numRays + 3, 9);

let inputs = resetEnvironment();

const loop = async () => {
  requestAnimationFrame(loop);
  const output = await agent.act(inputs);
  const {nextInputs, reward, done} = stepEnvironment(output);
  agent.remember(inputs, output, reward, nextInputs, done);
  inputs = nextInputs;
  if (sim.state.done) {
    inputs = resetEnvironment();
    await agent.replay(32);
  }
};

// for (let i = 0; i < 1000; i++) {
//   console.log(i);
//   while (!sim.state.done) {
//     const output = await agent.act(inputs);
//     const {nextInputs, reward, done} = stepEnvironment(output);
//     agent.remember(inputs, output, reward, nextInputs, done);
//     inputs = nextInputs;
//   }
//   await agent.replay(32);
// }

loop();
