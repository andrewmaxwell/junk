// Boids: each bird steers by separation, alignment and cohesion with the birds
// near it. Neighbors are found through a uniform grid, so a step costs roughly
// O(birds * neighbors) instead of O(birds^2).

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
const separation = 0.15;
const wander = 0.03;
const levelling = 0.003; // pull toward level flight, so flocks spread sideways
const bankPerTurn = 60; // roll, in radians, per unit of sideways heading change
const maxBank = 1.2;
const bankEase = 0.05; // how quickly a bird rolls toward its target bank

// Birds roam a wide, shallow box of sky and get pushed back past its walls.
const halfWidth = 250; // the box spans -halfWidth..halfWidth in x and z
const floor = -150;
const ceiling = 200;
const boundsStrength = 0.002;

// Invisible points that sweep through the sky and scatter the birds. Without
// them the flocks settle into steady loops around the bounds.
const numScares = 3;
const scareRadius = 45;
const scareStrength = 0.2;

// Each bird re-steers only every few steps, in rotation, which is what makes
// tens of thousands of birds affordable. Every bird still moves every step.
const steerEvery = 3;
const maxSteerDt = 6; // keeps steering stable when frames are slow

// the grid reaches a little past the box, to cover birds that overshoot it
const gridMargin = 60;
const gridX = Math.ceil((2 * (halfWidth + gridMargin)) / viewRadius);
const gridY = Math.ceil((ceiling - floor + 2 * gridMargin) / viewRadius);
const numCells = gridX * gridX * gridY;

const cellCoord = (value, min, count) =>
  Math.min(count - 1, Math.max(0, Math.floor((value - min) / viewRadius)));
const cellX = (x) => cellCoord(x, -halfWidth - gridMargin, gridX); // and z
const cellY = (y) => cellCoord(y, floor - gridMargin, gridY);

// how far a coordinate is outside min..max: negative below, positive above
const overshoot = (value, min, max) =>
  value < min ? value - min : value > max ? value - max : 0;

export const makeFlock = (numBirds) => {
  const positions = new Float32Array(numBirds * 3);
  const directions = new Float32Array(numBirds * 3);
  const speeds = new Float32Array(numBirds).fill(moveSpeed);
  const banks = new Float32Array(numBirds); // roll about the heading, in radians

  for (let i = 0; i < numBirds * 3; i += 3) {
    const x = Math.random() - 0.5;
    const y = Math.random() - 0.5;
    const z = Math.random() - 0.5;
    const length = Math.hypot(x, y, z) || 1;

    directions[i] = x / length;
    directions[i + 1] = y / length;
    directions[i + 2] = z / length;
    positions[i] = (Math.random() * 2 - 1) * halfWidth;
    positions[i + 1] = floor + Math.random() * (ceiling - floor);
    positions[i + 2] = (Math.random() * 2 - 1) * halfWidth;
  }

  // Birds sorted by cell: cell c holds slots cellStart[c] .. cellStart[c + 1].
  // nearPositions and nearDirections are copies in slot order, so the neighbor
  // search reads memory in sequence rather than hopping around.
  const cellOfBird = new Uint32Array(numBirds);
  const cellStart = new Uint32Array(numCells + 1);
  const cellFill = new Uint32Array(numCells);
  const birdInSlot = new Uint32Array(numBirds);
  const nearPositions = new Float32Array(numBirds * 3);
  const nearDirections = new Float32Array(numBirds * 3);

  const buildGrid = () => {
    cellStart.fill(0);
    for (let i = 0; i < numBirds; i++) {
      const cell =
        cellX(positions[i * 3]) +
        gridX *
          (cellX(positions[i * 3 + 2]) + gridX * cellY(positions[i * 3 + 1]));
      cellOfBird[i] = cell;
      cellStart[cell + 1]++;
    }
    for (let c = 0; c < numCells; c++) {
      cellStart[c + 1] += cellStart[c];
    }
    cellFill.set(cellStart.subarray(0, numCells));
    for (let i = 0; i < numBirds; i++) {
      const slot = cellFill[cellOfBird[i]]++;
      birdInSlot[slot] = i;
      nearPositions[slot * 3] = positions[i * 3];
      nearPositions[slot * 3 + 1] = positions[i * 3 + 1];
      nearPositions[slot * 3 + 2] = positions[i * 3 + 2];
      nearDirections[slot * 3] = directions[i * 3];
      nearDirections[slot * 3 + 1] = directions[i * 3 + 1];
      nearDirections[slot * 3 + 2] = directions[i * 3 + 2];
    }
  };

  const scares = new Float32Array(numScares * 3);
  let time = 0;

  const moveScares = (dt) => {
    time += dt;
    for (let s = 0; s < numScares; s++) {
      const pace = time * (1 + s * 0.3);
      scares[s * 3] = halfWidth * Math.sin(pace * 0.0012 + s * 2);
      scares[s * 3 + 1] =
        (floor + ceiling) / 2 +
        ((ceiling - floor) / 2) * Math.sin(pace * 0.002 + s * 3);
      scares[s * 3 + 2] = halfWidth * Math.cos(pace * 0.0016 + s);
    }
  };

  // turn bird i, which sits in the given grid slot, by dt worth of steering
  const steer = (i, slot, dt) => {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const cx = cellX(px);
    const cy = cellY(py);
    const cz = cellX(pz);

    let neighbors = 0;
    let centerX = 0, centerY = 0, centerZ = 0; // prettier-ignore
    let headingX = 0, headingY = 0, headingZ = 0; // prettier-ignore
    let awayX = 0, awayY = 0, awayZ = 0; // prettier-ignore

    for (let y = Math.max(0, cy - 1); y <= Math.min(gridY - 1, cy + 1); y++) {
      for (let z = Math.max(0, cz - 1); z <= Math.min(gridX - 1, cz + 1); z++) {
        // the three cells along x are next to each other in slot order
        const row = gridX * (z + gridX * y);
        const from = cellStart[row + Math.max(0, cx - 1)];
        const to = cellStart[row + Math.min(gridX - 1, cx + 1) + 1];

        for (let k = from; k < to; k++) {
          if (k === slot) continue;

          const ox = nearPositions[k * 3] - px;
          const oy = nearPositions[k * 3 + 1] - py;
          const oz = nearPositions[k * 3 + 2] - pz;
          const distanceSq = ox * ox + oy * oy + oz * oz;
          if (distanceSq >= viewRadius * viewRadius) continue;

          neighbors++;
          centerX += ox;
          centerY += oy;
          centerZ += oz;
          headingX += nearDirections[k * 3];
          headingY += nearDirections[k * 3 + 1];
          headingZ += nearDirections[k * 3 + 2];

          if (
            distanceSq < separationRadius * separationRadius &&
            distanceSq > 0
          ) {
            const distance = Math.sqrt(distanceSq);
            const push = (1 - distance / separationRadius) / distance;
            awayX -= ox * push;
            awayY -= oy * push;
            awayZ -= oz * push;
          }
        }
      }
    }

    const oldDx = directions[i * 3];
    const oldDy = directions[i * 3 + 1];
    const oldDz = directions[i * 3 + 2];
    let steerX = 0, steerY = 0, steerZ = 0; // prettier-ignore

    if (neighbors) {
      const cohere = cohesion / neighbors / viewRadius;
      steerX +=
        (headingX / neighbors - oldDx) * alignment +
        centerX * cohere +
        awayX * separation;
      steerY +=
        (headingY / neighbors - oldDy) * alignment +
        centerY * cohere +
        awayY * separation;
      steerZ +=
        (headingZ / neighbors - oldDz) * alignment +
        centerZ * cohere +
        awayZ * separation;
    }

    steerX -= overshoot(px, -halfWidth, halfWidth) * boundsStrength;
    steerY -= overshoot(py, floor, ceiling) * boundsStrength;
    steerZ -= overshoot(pz, -halfWidth, halfWidth) * boundsStrength;

    for (let s = 0; s < numScares; s++) {
      const ox = px - scares[s * 3];
      const oy = py - scares[s * 3 + 1];
      const oz = pz - scares[s * 3 + 2];
      const distanceSq = ox * ox + oy * oy + oz * oz;

      if (distanceSq < scareRadius * scareRadius && distanceSq > 0) {
        const distance = Math.sqrt(distanceSq);
        const flee = (scareStrength * (1 - distance / scareRadius)) / distance;
        steerX += ox * flee;
        steerY += oy * flee;
        steerZ += oz * flee;
      }
    }

    steerX += (Math.random() - 0.5) * wander;
    steerY += (Math.random() - 0.5) * wander - oldDy * levelling;
    steerZ += (Math.random() - 0.5) * wander;

    let dx = oldDx + steerX * dt;
    let dy = oldDy + steerY * dt;
    let dz = oldDz + steerZ * dt;

    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= length;
    dy /= length;
    dz /= length;

    // bank into turns: roll by how fast the heading swings sideways
    const level = Math.sqrt(oldDx * oldDx + oldDz * oldDz) || 1;
    const turn = ((dx - oldDx) * oldDz - (dz - oldDz) * oldDx) / level / dt;
    const bank = Math.max(-maxBank, Math.min(maxBank, -turn * bankPerTurn));
    banks[i] += (bank - banks[i]) * Math.min(1, bankEase * dt);

    // speed up when pulled forward or diving, slow when pushed back or climbing
    const forward = steerX * oldDx + steerY * oldDy + steerZ * oldDz;
    speeds[i] = Math.max(
      minSpeed,
      Math.min(
        maxSpeed,
        speeds[i] +
          (forward * thrust -
            dy * gravity +
            (moveSpeed - speeds[i]) * speedEase) *
            dt,
      ),
    );

    directions[i * 3] = dx;
    directions[i * 3 + 1] = dy;
    directions[i * 3 + 2] = dz;
  };

  let stepCount = 0;

  // dt is the time to advance, in units of the 1/120s step the constants
  // above are tuned for
  const step = (dt = 1) => {
    if (dt <= 0) return;

    buildGrid();
    moveScares(dt);
    stepCount++;

    const steerDt = Math.min(maxSteerDt, dt * steerEvery);

    for (let slot = 0; slot < numBirds; slot++) {
      const i = birdInSlot[slot];

      if ((i + stepCount) % steerEvery === 0) steer(i, slot, steerDt);

      const distance = speeds[i] * dt;
      positions[i * 3] += directions[i * 3] * distance;
      positions[i * 3 + 1] += directions[i * 3 + 1] * distance;
      positions[i * 3 + 2] += directions[i * 3 + 2] * distance;
    }
  };

  return {numBirds, positions, directions, banks, step};
};
