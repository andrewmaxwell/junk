const nsDensity = 4.8e17;
const G = 6.6743e-11;
const earthGravity = 9.807;
const tablespoon = 1.47868e-5;

// earth
// const rad = 6.371e6;
// const density = 5520;

// const surfaceGravity = G * (4 / 3) * Math.PI * rad * density;
// console.log(surfaceGravity);

const getGs = (volume, density) => {
  const rad = (volume / ((4 / 3) * Math.PI)) ** (1 / 3);
  const surfaceGravity = (G * volume * density) / rad ** 2;
  return surfaceGravity / earthGravity;
};

console.log(getGs(tablespoon, nsDensity).toLocaleString());
