// Boids on the GPU: each bird steers by separation, alignment and cohesion with
// the birds near it. Everything here runs as WebGPU compute shaders, written in
// three.js's shading language. Neighbors are found through a uniform grid that
// is rebuilt on the GPU every step.

import {Vector3} from 'three';
import {
  Fn,
  If,
  Loop,
  Return,
  atomicAdd,
  atomicLoad,
  atomicStore,
  clamp,
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
const separationRadius = 7;
const alignment = 0.06;
const cohesion = 0.04;
const edgeCohesion = 2; // extra pull inward for birds at the edge of a flock
const separation = 0.3;
// A bird can't see a cone behind it, as wide as the angle from straight ahead
// whose cosine is blindSpot. It ignores the birds there, so birds sit closer
// behind each other than beside each other, as in real flocks.
const blindSpot = -0.6;
const wander = 0.03;
const levelling = 0.003; // pull toward level flight, so flocks spread sideways
const bankPerTurn = 60; // roll, in radians, per unit of sideways heading change
const maxBank = 1.2;
const bankEase = 0.05; // how quickly a bird rolls toward its target bank

// Birds gather over a roost at the origin. Inside roostRadius they fly freely;
// past it, birds heading away get turned back, at full strength from
// roostRadius + roostEdge outward. floor and ceiling bound their height.
const roostRadius = 150;
const roostEdge = 150;
const roostTurn = 0.01;
const floor = -150;
const ceiling = 200;
const heightStrength = 0.002;

// The birds are drawn to a lure: the patch of reeds they're thinking of settling
// in, which keeps changing as they look the roost over. It wanders over the
// roost on a slow looping path. Birds far from it are pulled toward it, at full
// strength from lureRadius * 2 out, and fly freely near it, so the flock
// streams across the roost after it, overshoots and swirls back rather than
// circling the edge.
const lureRadius = 40;
const lureStrength = 0.002;
const lureSpeed = 0.0012; // radians per step along its path

// Falcons hunt the flock. Each picks a lonely bird near it, flies out high
// above it and dives.
const numFalcons = 1;
const falconSpeed = 1; // in level flight
const stoopSpeed = 1.5; // extra speed when diving straight down
const climbSlowdown = 0.4; // lost speed when climbing straight up
const falconTurn = 0.04; // how sharply a falcon turns toward its prey
const stoopHeight = 200; // how far above its prey a distant falcon flies
const stoopAngle = 0.6; // that height per unit of distance, so it dives as it closes
const strikeRadius = 15; // how close to its prey counts as a strike
const missRadius = 40; // a falcon that passes its prey this close has missed
const chaseSteps = 800; // roughly the longest a falcon stays on one bird
const preyCandidates = 16; // birds a falcon weighs up when choosing prey
const fleeRadius = 70; // how far off birds dodge a falcon
const fleeStrength = 0.3;

// A falcon startles the birds near it, and startled birds startle their
// neighbors, so a wave spreads through the whole flock. A startled bird is
// active for a moment, speeding up, following the other startled birds closely
// and passing the alarm on. Then it rests, and can't be startled again until
// it has. A long rest keeps waves from circling back on themselves, which
// would keep the flock in alarm forever.
const alarmRadius = 80;
const alarmActiveSteps = 60;
const alarmRestSteps = 900;
const alarmSteps = alarmActiveSteps + alarmRestSteps;
const alarmActive = alarmActiveSteps / alarmSteps; // the fraction spent active
const alarmDelay = 6; // average steps before an active neighbor startles a bird
const alarmFollow = 4; // how much more an active neighbor's heading counts
const alarmAlign = 4; // how much harder an active bird aligns
const alarmSpeed = 0.3; // extra cruising speed of an active bird
const alarmSqueeze = 0.6; // how much less an active bird keeps its distance

// The grid is a fixed block of cells that repeats across the sky, so it covers
// birds wherever they go. Two birds a whole block apart land in the same cell,
// which is harmless: they are too far apart to count as neighbors. Each cell
// holds up to cellCapacity birds; any beyond that go unnoticed by their
// neighbors, and ignore them, for a step. That only happens in a crush, but it
// feeds itself: left-out birds don't keep their distance, so they pack in even
// tighter. Dense flocks put 50 or more birds in a cell now and then, so the
// capacity has to be generous. The block only needs to be about as big as the
// roost, and keeping it small leaves memory for that capacity.
const gridX = 64; // cells along x and z
const gridY = 40;
const numCells = gridX * gridY * gridX;
const cellCapacity = 32;
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
  // how far into a startle each bird is: 1 just startled, counting down to 0
  // over alarmSteps
  const alarms = instancedArray(numBirds, 'float');
  // how many neighbors each bird saw last step, so falcons can find loners
  const crowding = instancedArray(numBirds, 'float');

  // How many birds are in each cell, and for each of them its position and
  // index, and its direction and alarm. Keeping these here means the neighbor
  // search reads one block of memory per cell, not a scattered bird at a time.
  // The directions and alarms are also a snapshot from before steering, so a
  // bird never sees a neighbor halfway through being updated.
  const cellCounts = instancedArray(numCells, 'uint').toAtomic();
  const cellBirds = instancedArray(numCells * cellCapacity, 'vec4');
  const cellDirections = instancedArray(numCells * cellCapacity, 'vec4');

  // whether each bird got a place in its cell this step
  const inGrid = instancedArray(numBirds, 'uint');

  // the falcons start spaced around the roost's edge, heading in
  const falconPositionData = new Float32Array(numFalcons * 4);
  const falconDirectionData = new Float32Array(numFalcons * 4);
  const falconPreyData = new Uint32Array(numFalcons);

  for (let i = 0; i < numFalcons; i++) {
    const around = (i / numFalcons) * Math.PI * 2;

    falconPositionData[i * 4] = Math.cos(around) * (roostRadius + roostEdge);
    falconPositionData[i * 4 + 1] = ceiling;
    falconPositionData[i * 4 + 2] =
      Math.sin(around) * (roostRadius + roostEdge);
    falconPositionData[i * 4 + 3] = Math.random() * Math.PI * 2;
    falconDirectionData[i * 4] = -Math.cos(around);
    falconDirectionData[i * 4 + 2] = -Math.sin(around);
    falconPreyData[i] = Math.floor(Math.random() * numBirds);
  }

  const falconPositions = instancedArray(falconPositionData, 'vec4');
  const falconDirections = instancedArray(falconDirectionData, 'vec4');
  const falconPrey = instancedArray(falconPreyData, 'uint'); // a bird's index

  const dt = uniform(1);
  const noiseSeed = uniform(0, 'uint');
  const lure = uniform(new Vector3());
  let lureAngle = Math.random() * 1000; // how far along its path the lure is

  // bank into turns: roll by how fast the heading swings sideways
  const bankInto = (oldDirection, direction, oldBank) => {
    const level = max(length(oldDirection.xz), 0.0001);
    const turn = direction.x
      .sub(oldDirection.x)
      .mul(oldDirection.z)
      .sub(direction.z.sub(oldDirection.z).mul(oldDirection.x))
      .div(level)
      .div(dt);
    const targetBank = clamp(turn.mul(-bankPerTurn), -maxBank, maxBank);

    return oldBank.add(targetBank.sub(oldBank).mul(min(dt.mul(bankEase), 1)));
  };

  const clearGrid = kernel(numCells, () => {
    atomicStore(cellCounts.element(instanceIndex), uint(0));
  });

  const fillGrid = kernel(numBirds, () => {
    const position = positions.element(instanceIndex).xyz.toVar();
    const coords = ivec3(cellCoords(position)).toVar();
    const cell = cellIndex(coords.x, coords.y, coords.z).toVar();
    const slot = atomicAdd(cellCounts.element(cell), uint(1)).toVar();

    If(slot.lessThan(uint(cellCapacity)), () => {
      const index = cell.mul(uint(cellCapacity)).add(slot).toVar();

      cellBirds.element(index).assign(vec4(position, float(instanceIndex)));
      cellDirections
        .element(index)
        .assign(
          vec4(
            directions.element(instanceIndex).xyz,
            alarms.element(instanceIndex),
          ),
        );
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
  // falcons.
  const steerBird = (own, seesNeighbors) => {
    const position = own.xyz.toVar();
    const bird = uint(own.w).toVar();
    const oldDirection = directions.element(bird).xyz.toVar();
    const oldBank = directions.element(bird).w.toVar();
    const oldSpeed = speeds.element(bird).toVar();
    const oldAlarm = alarms.element(bird).toVar();
    const active = select(
      oldAlarm.greaterThan(1 - alarmActive),
      float(1),
      float(0),
    ).toVar();

    const neighbors = float(0).toVar();
    const activeNeighbors = float(0).toVar();
    const center = vec3(0).toVar();
    const heading = vec3(0).toVar();
    const headingWeight = float(0).toVar();
    const away = vec3(0).toVar();
    const crowded = float(0).toVar(); // neighbors inside separationRadius

    const coords = cellCoords(position).toVar();
    const low = ivec3(coords.sub(1)).toVar();
    const high = ivec3(coords.add(1)).toVar();

    if (seesNeighbors) {
      Loop(
        {start: low.z, end: high.z, type: 'int', name: 'z', condition: '<='},
        ({z}) => {
          Loop(
            {
              start: low.y,
              end: high.y,
              type: 'int',
              name: 'y',
              condition: '<=',
            },
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
                      const index = first.add(slot).toVar();
                      const other = cellBirds.element(index).toVar();
                      const otherDirection = cellDirections
                        .element(index)
                        .toVar();
                      const offset = other.xyz.sub(position).toVar();
                      const distanceSq = dot(offset, offset).toVar();

                      // the bird itself is in the grid too, at a distance of
                      // exactly zero; birds behind it are in its blind spot
                      If(
                        distanceSq
                          .lessThan(viewRadius * viewRadius)
                          .and(distanceSq.greaterThan(0))
                          .and(
                            dot(offset, oldDirection).greaterThan(
                              sqrt(distanceSq).mul(blindSpot),
                            ),
                          ),
                        () => {
                          const otherActive = select(
                            otherDirection.w.greaterThan(1 - alarmActive),
                            float(1),
                            float(0),
                          );
                          const weight = otherActive.mul(alarmFollow).add(1);

                          neighbors.addAssign(1);
                          activeNeighbors.addAssign(otherActive);
                          center.addAssign(offset);
                          heading.addAssign(otherDirection.xyz.mul(weight));
                          headingWeight.addAssign(weight);

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
                              crowded.addAssign(1);
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
        heading
          .div(headingWeight)
          .sub(oldDirection)
          .mul(active.mul(alarmAlign).add(1).mul(alignment)),
      );
      // how far the neighbors' center is, in view radii: near 0 inside a
      // flock and up to about 0.4 at its edge
      const toCenter = center.div(neighbors).div(viewRadius).toVar();
      const edgePull = length(toCenter).mul(edgeCohesion).add(1);
      steering.addAssign(toCenter.mul(edgePull).mul(cohesion));
      // A crowd pushes harder than one bird that's too close, but only by the
      // square root of its size, so flocks can pack densely in places while
      // still spreading out enough to meet and merge. Active birds squeeze
      // together into dark bands.
      steering.addAssign(
        away
          .div(sqrt(max(crowded, 1)))
          .mul(float(1).sub(active.mul(alarmSqueeze)).mul(separation)),
      );
    });

    // Past the roost's edge, turn birds that are heading away back toward it.
    // Turning sideways, not pulling inward, is what brings a bird flying
    // straight out around in an arc.
    const fromRoost = length(position.xz).toVar();
    const outward = position.xz.div(max(fromRoost, 0.0001)).toVar();
    const levelHeading = oldDirection.xz
      .div(max(length(oldDirection.xz), 0.0001))
      .toVar();
    const leaving = dot(levelHeading, outward).mul(0.5).add(0.5);
    const pastEdge = smoothstep(
      roostRadius,
      roostRadius + roostEdge,
      fromRoost,
    );
    const left = vec2(levelHeading.y.negate(), levelHeading.x).toVar();
    const inward = select(dot(left, outward).lessThan(0), left, left.negate());
    const turnBack = inward.mul(leaving).mul(pastEdge).mul(roostTurn).toVar();
    steering.addAssign(vec3(turnBack.x, 0, turnBack.y));

    const toLure = lure.sub(position).toVar();
    const lureDistance = max(length(toLure), 0.0001);
    steering.addAssign(
      toLure
        .div(lureDistance)
        .mul(smoothstep(lureRadius, lureRadius * 2, lureDistance))
        .mul(lureStrength),
    );

    // push back by how far above the ceiling or below the floor the bird is
    steering.y.subAssign(
      position.y.sub(clamp(position.y, floor, ceiling)).mul(heightStrength),
    );

    const nearFalcon = float(0).toVar();

    Loop(
      {
        start: uint(0),
        end: uint(numFalcons),
        type: 'uint',
        name: 'falcon',
        condition: '<',
      },
      ({falcon}) => {
        const offset = position
          .sub(falconPositions.element(falcon).xyz)
          .toVar();
        const distance = length(offset).toVar();

        If(distance.lessThan(fleeRadius).and(distance.greaterThan(0)), () => {
          const flee = float(1)
            .sub(distance.div(fleeRadius))
            .mul(fleeStrength)
            .div(distance);
          steering.addAssign(offset.mul(flee));
        });
        If(distance.lessThan(alarmRadius), () => {
          nearFalcon.assign(1);
        });
      },
    );

    const seed = bird.mul(uint(4)).add(noiseSeed).toVar();
    const noise = vec3(
      hash(seed),
      hash(seed.add(uint(1))),
      hash(seed.add(uint(2))),
    );
    steering.addAssign(noise.sub(0.5).mul(wander));
    steering.y.subAssign(oldDirection.y.mul(levelling));

    const direction = normalize(oldDirection.add(steering.mul(dt))).toVar();

    const bank = bankInto(oldDirection, direction, oldBank);

    // speed up when pulled forward or diving, slow when pushed back or climbing
    const forward = dot(steering, oldDirection);
    const acceleration = forward
      .mul(thrust)
      .sub(direction.y.mul(gravity))
      .add(active.mul(alarmSpeed).add(moveSpeed).sub(oldSpeed).mul(speedEase));
    const speed = clamp(oldSpeed.add(acceleration.mul(dt)), minSpeed, maxSpeed);

    // a calm bird is startled by a falcon close by, or after a moment by an
    // active neighbor
    const alarm = max(oldAlarm.sub(dt.div(alarmSteps)), 0).toVar();
    const caught = activeNeighbors
      .greaterThan(0)
      .and(hash(seed.add(uint(3))).lessThan(dt.div(alarmDelay)));

    If(
      oldAlarm.lessThanEqual(0).and(nearFalcon.greaterThan(0).or(caught)),
      () => {
        alarm.assign(1);
      },
    );

    directions.element(bird).assign(vec4(direction, bank));
    speeds.element(bird).assign(speed);
    alarms.element(bird).assign(alarm);
    crowding.element(bird).assign(neighbors);
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

  // Each falcon flies at its prey from high above, so the last stretch is a
  // dive. After a strike, a miss, or a chase that drags on, it looks over a
  // few birds and picks the nearest, favoring those with few neighbors.
  const hunt = kernel(numFalcons, () => {
    const position = falconPositions.element(instanceIndex);
    const oldDirection = falconDirections.element(instanceIndex).xyz.toVar();
    const oldBank = falconDirections.element(instanceIndex).w.toVar();
    const prey = falconPrey.element(instanceIndex);
    const toPrey = positions.element(prey).xyz.sub(position.xyz).toVar();
    const distance = length(toPrey).toVar();

    const above = min(length(toPrey.xz).mul(stoopAngle), stoopHeight);
    const aim = toPrey.add(vec3(0, above, 0)).toVar();
    const direction = normalize(
      oldDirection.add(
        aim
          .div(max(length(aim), 0.0001))
          .mul(falconTurn)
          .mul(dt),
      ),
    ).toVar();
    const speed = float(falconSpeed)
      .add(max(direction.y.negate(), 0).mul(stoopSpeed))
      .sub(max(direction.y, 0).mul(climbSlowdown));

    falconDirections
      .element(instanceIndex)
      .assign(vec4(direction, bankInto(oldDirection, direction, oldBank)));
    position.assign(
      vec4(position.xyz.add(direction.mul(speed).mul(dt)), position.w),
    );

    const seed = instanceIndex
      .mul(uint(preyCandidates + 1))
      .add(noiseSeed)
      .toVar();
    const givesUp = hash(seed).lessThan(dt.div(chaseSteps));
    const missed = distance
      .lessThan(missRadius)
      .and(dot(toPrey, direction).lessThan(0));

    If(distance.lessThan(strikeRadius).or(missed).or(givesUp), () => {
      const best = uint(0).toVar();
      const bestCost = float(1e30).toVar();

      Loop(
        {
          start: uint(0),
          end: uint(preyCandidates),
          type: 'uint',
          name: 'candidate',
          condition: '<',
        },
        ({candidate}) => {
          const bird = min(
            uint(hash(seed.add(candidate).add(uint(1))).mul(numBirds)),
            uint(numBirds - 1),
          ).toVar();
          const cost = length(positions.element(bird).xyz.sub(position.xyz))
            .mul(crowding.element(bird).add(2))
            .toVar();

          If(cost.lessThan(bestCost), () => {
            best.assign(bird);
            bestCost.assign(cost);
          });
        },
      );

      prey.assign(best);
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
    birds: {count: numBirds, positions, directions},
    falcons: {
      count: numFalcons,
      positions: falconPositions,
      directions: falconDirections,
    },
    // Advances the flock. compute runs one compute shader on the GPU; stepDt is
    // the time to advance, in units of the 1/120s step the constants above are
    // tuned for.
    step(compute, stepDt) {
      if (stepDt <= 0) return;

      dt.value = stepDt;
      noiseSeed.value = Math.floor(Math.random() * 2 ** 32);

      // two loops at unrelated speeds, so the path takes ages to repeat
      lureAngle += stepDt * lureSpeed;
      const a = lureAngle;
      lure.value.set(
        roostRadius * (0.7 * Math.sin(a) + 0.3 * Math.sin(a * 2.7 + 1)),
        (floor + ceiling) / 2 + ((ceiling - floor) / 4) * Math.sin(a * 0.6),
        roostRadius *
          (0.7 * Math.sin(a * 1.3 + 2) + 0.3 * Math.sin(a * 2.1 + 3)),
      );

      compute(clearGrid);
      compute(fillGrid);
      compute(hunt);
      compute(steer);
      compute(steerLeftOut);
      compute(move);
    },
  };
};
