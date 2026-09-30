/*
Double density relaxation, from Clavet et al's "Particle-based Viscoelastic
Fluid Simulation", by way of https://peeke.nl/simulating-blobs-of-fluid.

Every particle gets two pressures from its neighbors:
  - a far one that pulls them toward restDensity, which is what makes the
    stuff hold together like a liquid instead of piling up like sand
  - a near one that only ever pushes, which stops them collapsing into a point

Both move positions directly. The caller is using Verlet integration, so a
displacement here becomes velocity on the next step for free.

Shared by particle-fluid and fluid-maze. Needs a Grid whose cells' `items`
hold every particle within `radius`, and Float32Arrays of coordinates.
*/

// scratch space for one particle's neighbors, grown as needed
let neighborIndex = new Int32Array(0);
let gradient = new Float32Array(0);
let deltaX = new Float32Array(0);
let deltaY = new Float32Array(0);
let distance = new Float32Array(0);

const grow = (size) => {
  if (neighborIndex.length >= size) return;
  neighborIndex = new Int32Array(size);
  gradient = new Float32Array(size);
  deltaX = new Float32Array(size);
  deltaY = new Float32Array(size);
  distance = new Float32Array(size);
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
  grow(numParticles);

  const invRad2 = 1 / (radius * radius);
  const farScale = stiffness * stiffness * speed * invRad2;
  const nearScale = stiffnessNear * stiffnessNear * speed * invRad2;

  for (let i = 0; i < numParticles; i++) {
    let count = 0;
    let density = 0;
    let nearDensity = 0;

    for (const n of grid.getCell(xCoord[i], yCoord[i]).items) {
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

      neighborIndex[count] = n;
      gradient[count] = g;
      deltaX[count] = dx;
      deltaY[count] = dy;
      distance[count] = dist;
      count++;
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
