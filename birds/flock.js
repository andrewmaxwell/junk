// Boids on the GPU: each bird steers by separation, alignment and cohesion with
// the birds near it. Everything here runs as WebGPU compute shaders, written in
// three.js's shading language. Neighbors are found through a uniform grid that
// is rebuilt on the GPU every step.

import {
  Fn,
  If,
  Loop,
  Return,
  atomicAdd,
  atomicLoad,
  atomicStore,
  clamp,
  cos,
  dot,
  float,
  hash,
  instancedArray,
  instanceIndex,
  int,
  ivec3,
  length,
  max,
  min,
  normalize,
  select,
  sin,
  smoothstep,
  sqrt,
  uint,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

const moveSpeed = 0.5; // cruising speed
const minSpeed = 0.3;
const maxSpeed = 0.8;
const thrust = 0.15; // how much steering forward or backward changes speed
const gravity = 0.004; // birds gain speed diving and lose it climbing
const speedEase = 0.03; // how quickly speed settles back to cruising
const viewRadius = 12; // how far a bird sees; also the grid cell size
const separationRadius = 8;
const alignment = 0.06;
const cohesion = 0.04;
const edgeCohesion = 2; // extra pull inward for birds at the edge of a flock
const separation = 0.25;
const wander = 0.03;
const levelling = 0.003; // pull toward level flight, so flocks spread sideways
const bankPerTurn = 60; // roll, in radians, per unit of sideways heading change
const maxBank = 1.2;
const bankEase = 0.05; // how quickly a bird rolls toward its target bank

// Birds gather over a roost at the origin. Inside roostRadius they fly freely;
// past it, birds heading away get turned back, at full strength from
// roostRadius + roostEdge outward. floor and ceiling bound their height.
const roostRadius = 500;
const roostEdge = 300;
const roostTurn = 0.01;
const floor = -150;
const ceiling = 300;
const heightStrength = 0.002;

// Invisible points that sweep through the sky and scatter the birds. Without
// them the flock settles into a steady loop around the roost.
const numScares = 3;
const scareRadius = 45;
const scareStrength = 0.2;

// The grid is a fixed block of cells that repeats across the sky, so it covers
// birds wherever they go. Two birds a whole block apart land in the same cell,
// which is harmless: they are too far apart to count as neighbors. Each cell
// holds up to cellCapacity birds; any beyond that go unnoticed by their
// neighbors, and ignore them, for a step. That only happens in a crush.
const gridX = 92; // cells along x and z
const gridY = 48;
const numCells = gridX * gridY * gridX;
const cellCapacity = 12;
const gridSize = vec3(gridX, gridY, gridX);

// grid coordinates of a position, as a float vector wrapped into the block
const cellCoords = (position) => {
  const cell = position.div(viewRadius).floor();
  return cell.sub(cell.div(gridSize).floor().mul(gridSize));
};

// wraps a coordinate that has stepped one cell off either end of the block
const wrap = (coord, size) =>
  select(
    coord.lessThan(int(0)),
    coord.add(int(size)),
    select(coord.greaterThanEqual(int(size)), coord.sub(int(size)), coord),
  );

const cellIndex = (x, y, z) =>
  uint(x.add(y.mul(int(gridX))).add(z.mul(int(gridX * gridY))));

// A compute shader that runs body once for each index below count. Shaders run
// in fixed-size groups, so a few spare runs land past the end and must do
// nothing.
const kernel = (count, body) =>
  Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(count)), () => {
      Return();
    });
    body();
  })().compute(count);

export const makeFlock = (numBirds) => {
  const positionData = new Float32Array(numBirds * 4); // xyz, flap phase
  const directionData = new Float32Array(numBirds * 4); // xyz, bank in radians

  // the birds start scattered all over the roost, each heading its own way
  for (let i = 0; i < numBirds * 4; i += 4) {
    const fromRoost = Math.sqrt(Math.random()) * (roostRadius + roostEdge);
    const around = Math.random() * Math.PI * 2;

    positionData[i] = Math.cos(around) * fromRoost;
    positionData[i + 1] = floor + Math.random() * (ceiling - floor);
    positionData[i + 2] = Math.sin(around) * fromRoost;
    positionData[i + 3] = Math.random() * Math.PI * 2;

    let dx, dy, dz, size;
    do {
      dx = Math.random() * 2 - 1;
      dy = Math.random() * 2 - 1;
      dz = Math.random() * 2 - 1;
      size = Math.hypot(dx, dy, dz);
    } while (size > 1 || size < 0.01);

    directionData[i] = dx / size;
    directionData[i + 1] = dy / size;
    directionData[i + 2] = dz / size;
  }

  const positions = instancedArray(positionData, 'vec4');
  const directions = instancedArray(directionData, 'vec4');
  const speeds = instancedArray(
    new Float32Array(numBirds).fill(moveSpeed),
    'float',
  );
  // How many birds are in each cell, and for each of them its position and
  // index. Keeping positions here means the neighbor search reads one block of
  // memory per cell, not a scattered bird at a time.
  const cellCounts = instancedArray(numCells, 'uint').toAtomic();
  const cellBirds = instancedArray(numCells * cellCapacity, 'vec4');

  // whether each bird got a place in its cell this step
  const inGrid = instancedArray(numBirds, 'uint');

  const dt = uniform(1);
  const time = uniform(0);
  const noiseSeed = uniform(0, 'uint');

  const clearGrid = kernel(numCells, () => {
    atomicStore(cellCounts.element(instanceIndex), uint(0));
  });

  const fillGrid = kernel(numBirds, () => {
    const position = positions.element(instanceIndex).xyz.toVar();
    const coords = ivec3(cellCoords(position)).toVar();
    const cell = cellIndex(coords.x, coords.y, coords.z).toVar();
    const slot = atomicAdd(cellCounts.element(cell), uint(1)).toVar();

    If(slot.lessThan(uint(cellCapacity)), () => {
      cellBirds
        .element(cell.mul(uint(cellCapacity)).add(slot))
        .assign(vec4(position, float(instanceIndex)));
      inGrid.element(instanceIndex).assign(uint(1));
    }).Else(() => {
      inGrid.element(instanceIndex).assign(uint(0));
    });
  });

  // how many birds a cell holds, up to its capacity
  const cellSize = (cell) => {
    const count = atomicLoad(cellCounts.element(cell)).toVar();

    If(count.greaterThan(uint(cellCapacity)), () => {
      count.assign(uint(cellCapacity));
    });
    return count;
  };

  // Turns one bird, given its position and index packed as a grid slot. A
  // bird that doesn't see its neighbors still heads for the roost and flees
  // scares.
  const steerBird = (own, seesNeighbors) => {
    const position = own.xyz.toVar();
    const bird = uint(own.w).toVar();
    const oldDirection = directions.element(bird).xyz.toVar();
    const oldBank = directions.element(bird).w.toVar();
    const oldSpeed = speeds.element(bird).toVar();

    const neighbors = float(0).toVar();
    const center = vec3(0).toVar();
    const heading = vec3(0).toVar();
    const away = vec3(0).toVar();

    const coords = cellCoords(position).toVar();
    const low = ivec3(coords.sub(1)).toVar();
    const high = ivec3(coords.add(1)).toVar();

    if (seesNeighbors) {
      Loop(
        {start: low.z, end: high.z, type: 'int', name: 'z', condition: '<='},
        ({z}) => {
          Loop(
            {start: low.y, end: high.y, type: 'int', name: 'y', condition: '<='},
            ({y}) => {
              Loop(
                {
                  start: low.x,
                  end: high.x,
                  type: 'int',
                  name: 'x',
                  condition: '<=',
                },
                ({x}) => {
                  const cell = cellIndex(
                    wrap(x, gridX),
                    wrap(y, gridY),
                    wrap(z, gridX),
                  ).toVar();
                  const first = cell.mul(uint(cellCapacity)).toVar();
                  const count = cellSize(cell);

                  Loop(
                    {
                      start: uint(0),
                      end: count,
                      type: 'uint',
                      name: 'slot',
                      condition: '<',
                    },
                    ({slot}) => {
                      const other = cellBirds.element(first.add(slot)).toVar();
                      const offset = other.xyz.sub(position).toVar();
                      const distanceSq = dot(offset, offset).toVar();

                      // the bird itself is in the grid too, at a distance of exactly zero
                      If(
                        distanceSq
                          .lessThan(viewRadius * viewRadius)
                          .and(distanceSq.greaterThan(0)),
                        () => {
                          neighbors.addAssign(1);
                          center.addAssign(offset);
                          heading.addAssign(
                            directions.element(uint(other.w)).xyz,
                          );

                          If(
                            distanceSq.lessThan(
                              separationRadius * separationRadius,
                            ),
                            () => {
                              const distance = sqrt(distanceSq);
                              const push = float(1)
                                .sub(distance.div(separationRadius))
                                .div(distance);
                              away.subAssign(offset.mul(push));
                            },
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    }

    const steering = vec3(0).toVar();

    If(neighbors.greaterThan(0), () => {
      steering.addAssign(
        heading.div(neighbors).sub(oldDirection).mul(alignment),
      );
      // how far the neighbors' center is, in view radii: near 0 inside a
      // flock and up to about 0.4 at its edge
      const toCenter = center.div(neighbors).div(viewRadius).toVar();
      const edgePull = length(toCenter).mul(edgeCohesion).add(1);
      steering.addAssign(toCenter.mul(edgePull).mul(cohesion));
      steering.addAssign(away.mul(separation));
    });

    // Past the roost's edge, turn birds that are heading away back toward it.
    // Turning sideways, not pulling inward, is what brings a bird flying
    // straight out around in an arc.
    const fromRoost = length(position.xz).toVar();
    const outward = position.xz.div(max(fromRoost, 0.0001)).toVar();
    const levelHeading = oldDirection.xz.div(max(length(oldDirection.xz), 0.0001)).toVar();
    const leaving = dot(levelHeading, outward).mul(0.5).add(0.5);
    const pastEdge = smoothstep(roostRadius, roostRadius + roostEdge, fromRoost);
    const left = vec2(levelHeading.y.negate(), levelHeading.x).toVar();
    const inward = select(dot(left, outward).lessThan(0), left, left.negate());
    const turnBack = inward.mul(leaving).mul(pastEdge).mul(roostTurn).toVar();
    steering.addAssign(vec3(turnBack.x, 0, turnBack.y));

    // push back by how far above the ceiling or below the floor the bird is
    steering.y.subAssign(position.y.sub(clamp(position.y, floor, ceiling)).mul(heightStrength));

    Loop(
      {
        start: int(0),
        end: int(numScares),
        type: 'int',
        name: 's',
        condition: '<',
      },
      ({s}) => {
        // each scare wanders over the roost on its own looping path
        const n = float(s);
        const pace = time.mul(sin(n.mul(1.7)).mul(0.5).add(1)).toVar();
        const scare = vec3(
          sin(pace.mul(0.0012).add(n.mul(2))).mul(roostRadius + roostEdge),
          sin(pace.mul(0.002).add(n.mul(3)))
            .mul((ceiling - floor) / 2)
            .add((floor + ceiling) / 2),
          cos(pace.mul(0.0016).add(n)).mul(roostRadius + roostEdge),
        );
        const offset = position.sub(scare).toVar();
        const distance = length(offset).toVar();

        If(distance.lessThan(scareRadius).and(distance.greaterThan(0)), () => {
          const flee = float(1)
            .sub(distance.div(scareRadius))
            .mul(scareStrength)
            .div(distance);
          steering.addAssign(offset.mul(flee));
        });
      },
    );

    const seed = bird.mul(uint(3)).add(noiseSeed).toVar();
    const noise = vec3(
      hash(seed),
      hash(seed.add(uint(1))),
      hash(seed.add(uint(2))),
    );
    steering.addAssign(noise.sub(0.5).mul(wander));
    steering.y.subAssign(oldDirection.y.mul(levelling));

    const direction = normalize(oldDirection.add(steering.mul(dt))).toVar();

    // bank into turns: roll by how fast the heading swings sideways
    const level = max(length(oldDirection.xz), 0.0001);
    const turn = direction.x
      .sub(oldDirection.x)
      .mul(oldDirection.z)
      .sub(direction.z.sub(oldDirection.z).mul(oldDirection.x))
      .div(level)
      .div(dt);
    const targetBank = clamp(turn.mul(-bankPerTurn), -maxBank, maxBank);
    const bank = oldBank.add(
      targetBank.sub(oldBank).mul(min(dt.mul(bankEase), 1)),
    );

    // speed up when pulled forward or diving, slow when pushed back or climbing
    const forward = dot(steering, oldDirection);
    const acceleration = forward
      .mul(thrust)
      .sub(direction.y.mul(gravity))
      .add(float(moveSpeed).sub(oldSpeed).mul(speedEase));
    const speed = clamp(oldSpeed.add(acceleration.mul(dt)), minSpeed, maxSpeed);

    directions.element(bird).assign(vec4(direction, bank));
    speeds.element(bird).assign(speed);
  };

  // Runs once per grid slot rather than once per bird, steering whichever bird
  // is in the slot. Going through the grid in order keeps each bird's
  // neighborhood in memory the previous few birds just touched, which is
  // several times faster than visiting birds in their own scattered order.
  const steer = kernel(numCells * cellCapacity, () => {
    const cell = instanceIndex.div(uint(cellCapacity)).toVar();
    const slot = instanceIndex.sub(cell.mul(uint(cellCapacity)));

    If(slot.greaterThanEqual(atomicLoad(cellCounts.element(cell))), () => {
      Return();
    });

    steerBird(cellBirds.element(instanceIndex).toVar(), true);
  });

  // birds squeezed out of a full cell are steered here, without neighbors
  const steerLeftOut = kernel(numBirds, () => {
    If(inGrid.element(instanceIndex).equal(uint(0)), () => {
      const position = positions.element(instanceIndex).xyz;
      steerBird(vec4(position, float(instanceIndex)).toVar(), false);
    });
  });

  const move = kernel(numBirds, () => {
    const position = positions.element(instanceIndex);
    const travel = directions
      .element(instanceIndex)
      .xyz.mul(speeds.element(instanceIndex))
      .mul(dt);

    position.assign(vec4(position.xyz.add(travel), position.w));
  });

  return {
    numBirds,
    positions,
    directions,
    // Advances the flock. compute runs one compute shader on the GPU; stepDt is
    // the time to advance, in units of the 1/120s step the constants above are
    // tuned for.
    step(compute, stepDt) {
      if (stepDt <= 0) return;

      dt.value = stepDt;
      time.value += stepDt;
      noiseSeed.value = Math.floor(Math.random() * 2 ** 32);

      compute(clearGrid);
      compute(fillGrid);
      compute(steer);
      compute(steerLeftOut);
      compute(move);
    },
  };
};
