import {Simulator} from '../cutting-corners/Simulator.js';
import {objMap} from './utils.js';

const bodyOptions = {
  friction: 1,
  frictionStatic: 5,
  frictionAir: 0,
  density: 0.01,
};

export const makeTrebuchetSim = (params) => {
  const {
    baseWidth,
    baseHeight,
    baseDensity,
    armLengthLeft,
    armLengthRight,
    armThickness,
    armDensity,
    weightRad,
    weightDensity,
    launchAngle,
    fulcrumX,
    fulcrumY,
  } = params;

  const fulcrumShiftX = baseWidth * (fulcrumX - 0.5);
  const fulcrumShiftY = baseHeight * fulcrumY;

  const sim = new Simulator();
  sim.reset({enableMouse: false});
  sim.addRectangle(0, 100, 1e6, 200, {...bodyOptions, isStatic: true}); // floor

  const opts = {
    ...bodyOptions,
    collisionFilter: {group: sim.getCollisionGroup()},
  };

  const base = sim.addRectangle(0, -baseHeight / 2, baseWidth, baseHeight, {
    density: baseDensity,
    ...opts,
  });

  const arm = sim.addRectangle(
    -armLengthLeft / 2 + armLengthRight / 2 + fulcrumShiftX,
    -baseHeight + fulcrumShiftY,
    armLengthLeft + armLengthRight,
    armThickness,
    {density: armDensity, ...opts}
  );

  sim.addConstraint({
    bodyA: base,
    bodyB: arm,
    pointA: {x: fulcrumShiftX, y: -baseHeight / 2 + fulcrumShiftY},
    pointB: {x: armLengthLeft / 2 - armLengthRight / 2, y: 0},
    length: 0,
  });

  const weight = sim.addCircle(
    armLengthRight + fulcrumShiftX,
    -baseHeight + fulcrumShiftY,
    weightRad,
    {...opts, density: weightDensity}
  );

  sim.addConstraint({
    bodyA: arm,
    bodyB: weight,
    pointA: {x: armLengthLeft / 2 + armLengthRight / 2, y: 0},
    length: 0,
  });

  const ball = sim.addCircle(-armLengthLeft + fulcrumShiftX, -10, 10, opts);
  const rope = sim.addConstraint({
    bodyA: arm,
    bodyB: ball,
    pointA: {x: -armLengthLeft / 2 - armLengthRight / 2, y: 0},
  });

  let hasRope = true;
  let maxAltitude = -Infinity;
  sim.onStep(() => {
    maxAltitude = Math.max(maxAltitude, -ball.position.y);
    if (hasRope && arm.angle > launchAngle) {
      sim.removeBody(rope);
      hasRope = false;
    }
  });

  return {
    sim,
    getData: (goals) => objMap((v) => v({ball, maxAltitude}), goals),
  };
};
