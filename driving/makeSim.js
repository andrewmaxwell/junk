const maxRaySteps = 32;

const distanceToClosestObstacle = (x, y, angle, obstacles, width, height) => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let result = 0;
  for (let i = 0; i < maxRaySteps; i++) {
    let minDist = Math.min(x, y, width - x, height - y);
    for (const o of obstacles) {
      minDist = Math.min(minDist, Math.hypot(o.x - x, o.y - y) - o.rad);
    }
    x += dx * minDist;
    y += dy * minDist;
    result += minDist;
    if (minDist < 0.5) break;
  }
  return result;
};

export const makeSim = ({
  width,
  height,
  numObstacles,
  minObstacleRad,
  maxObstacleRad,
  carRadius,
  carFov,
  carAcceleration,
  carTurnSpeed,
  numRays,
  carDrag,
  maxFrames,
}) => {
  const state = {
    car: {angle: 0, speed: 0, x: carRadius, y: height / 2},
    obstacles: Array.from({length: numObstacles}, () => {
      const rad =
        minObstacleRad + Math.random() * (maxObstacleRad - minObstacleRad);
      const margin = 2 * carRadius + rad;
      return {
        x: margin + Math.random() * (width - 2 * margin),
        y: Math.random() * height,
        rad,
      };
    }),
    goal: {x: width - carRadius, y: height / 2},
    frame: 0,
    rays: [],
    done: false,
  };

  const iterate = (up, down, left, right) => {
    const {car, obstacles, goal} = state;

    // control
    if (up) car.speed += carAcceleration;
    if (down) car.speed -= carAcceleration;
    if (right) car.angle += carTurnSpeed;
    if (left) car.angle -= carTurnSpeed;

    // move
    car.x += car.speed * Math.cos(car.angle);
    car.y += car.speed * Math.sin(car.angle);
    car.speed *= carDrag;

    // obstacles
    for (const o of obstacles) {
      const dx = car.x - o.x;
      const dy = car.y - o.y;
      const dist = Math.hypot(dx, dy);
      const overlap = carRadius + o.rad - dist;
      if (overlap > 0) {
        const amt = overlap / dist;
        car.x += dx * amt;
        car.y += dy * amt;
        car.speed = 0;
      }
    }

    // boundaries
    if (car.x - carRadius < 0) {
      car.x = carRadius;
      car.speed = 0;
    } else if (car.x + carRadius > width) {
      car.x = width - carRadius;
      car.speed = 0;
    }
    if (car.y - carRadius < 0) {
      car.y = carRadius;
      car.speed = 0;
    } else if (car.y + carRadius > height) {
      car.y = height - carRadius;
      car.speed = 0;
    }

    // rays
    for (let i = 0; i < numRays; i++) {
      const angle = car.angle + (i / numRays - 0.5) * carFov;
      state.rays[i] = {
        angle,
        dist: distanceToClosestObstacle(
          car.x,
          car.y,
          angle,
          obstacles,
          width,
          height
        ),
      };
    }

    state.frame++;

    state.goalDist = Math.hypot(goal.x - car.x, goal.y - car.y) - 2 * carRadius;

    if (state.goalDist <= 0 || state.frame >= maxFrames) state.done = true;
  };

  return {iterate, state};
};
