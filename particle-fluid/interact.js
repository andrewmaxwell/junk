/*
Double density relaxation, from Clavet et al's "Particle-based Viscoelastic
Fluid Simulation", by way of https://peeke.nl/simulating-blobs-of-fluid.

Every particle gets two pressures from its neighbors:
  - a far one that pulls them toward restDensity, which is what makes the
    stuff hold together like a liquid instead of piling up like sand
  - a near one that only ever pushes, which stops them collapsing into a point

Both move positions directly. The caller is using Verlet integration, so a
displacement here becomes velocity on the next step for free.

Shared by particle-fluid and fluid-maze. Needs a Grid with cells `radius`
wide that was sorted since the particles last moved, and Float32Arrays of
coordinates.
*/

// scratch space for one particle's neighbors, grown as needed
let neighborIndex = new Int32Array(64);
let gradient = new Float32Array(64);
let deltaX = new Float32Array(64);
let deltaY = new Float32Array(64);
let distance = new Float32Array(64);

const grow = () => {
  const size = 2 * neighborIndex.length;
  const copy = (Type, old) => {
    const array = new Type(size);
    array.set(old);
    return array;
  };
  neighborIndex = copy(Int32Array, neighborIndex);
  gradient = copy(Float32Array, gradient);
  deltaX = copy(Float32Array, deltaX);
  deltaY = copy(Float32Array, deltaY);
  distance = copy(Float32Array, distance);
};

export const interact = ({
  numParticles,
  xCoord,
  yCoord,
  grid,
  radius,
  restDensity,
  stiffness,
  stiffnessNear,
  speed,
}) => {
  const {cols, rows, cellStart} = grid;
  const invRad2 = 1 / (radius * radius);
  const farScale = stiffness * stiffness * speed * invRad2;
  const nearScale = stiffnessNear * stiffnessNear * speed * invRad2;

  for (let i = 0; i < numParticles; i++) {
    let count = 0;
    let density = 0;
    let nearDensity = 0;

    // each row of the 3x3 block of cells is one contiguous run of particles
    const col = grid.col(xCoord[i]);
    const row = grid.row(yCoord[i]);
    const c0 = Math.max(0, col - 1);
    const c1 = Math.min(cols - 1, col + 1);
    for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
      const end = cellStart[r * cols + c1 + 1];
      for (let n = cellStart[r * cols + c0]; n < end; n++) {
        if (n === i) continue;
        const dx = xCoord[n] - xCoord[i];
        const dy = yCoord[n] - yCoord[i];
        // the floor keeps two particles on top of each other from exploding
        const lsq = Math.max(1, dx * dx + dy * dy);
        if (lsq >= radius * radius) continue;

        const dist = Math.sqrt(lsq);
        const g = 1 - dist / radius;
        density += g * g;
        nearDensity += g * g * g;

        if (count === neighborIndex.length) grow();
        neighborIndex[count] = n;
        gradient[count] = g;
        deltaX[count] = dx;
        deltaY[count] = dy;
        distance[count] = dist;
        count++;
      }
    }

    // the far pressure goes negative below restDensity, pulling neighbors in
    const pressure = farScale * (density - radius * restDensity);
    const nearPressure = nearScale * nearDensity;

    for (let k = 0; k < count; k++) {
      const g = gradient[k];
      const amt = (pressure * g + nearPressure * g * g) / distance[k];
      const ax = deltaX[k] * amt;
      const ay = deltaY[k] * amt;
      xCoord[i] -= ax;
      yCoord[i] -= ay;
      xCoord[neighborIndex[k]] += ax;
      yCoord[neighborIndex[k]] += ay;
    }
  }
};
