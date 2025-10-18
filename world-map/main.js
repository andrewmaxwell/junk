/** @typedef {[number, number]} Coord */

const speed = 0.01; // degrees per millisecond

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
const width = (canvas.width = innerWidth);
const height = (canvas.height = innerHeight);
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

// /** @param {Coord} point @param {Coord} center @returns {Coord} */
// const projection = ([lon, lat], [lon0, lat0]) => {
//   lon = ((lon - lon0) * Math.PI) / 180;
//   lat = (lat * Math.PI) / 180;
//   lat0 = (lat0 * Math.PI) / 180;

//   const k =
//     2 /
//     (1 +
//       Math.sin(lat0) * Math.sin(lat) +
//       Math.cos(lat0) * Math.cos(lat) * Math.cos(lon));
//   const x = width * ((k * Math.cos(lat) * Math.sin(lon)) / (2 * Math.PI) + 0.5);
//   const y =
//     height *
//     (1 -
//       ((k *
//         (Math.cos(lat0) * Math.sin(lat) -
//           Math.sin(lat0) * Math.cos(lat) * Math.cos(lon))) /
//         (2 * Math.PI) +
//         0.5));

//   return [x, y];
// };
/** @param {Coord} point @param {Coord} center @returns {Coord} */
const projection = ([lon, lat], [lon0, lat0]) => {
  const λ = ((lon - lon0) * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  const φ0 = (lat0 * Math.PI) / 180;

  // central angle and azimuth
  const c = Math.acos(
    Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ),
  );
  const θ = Math.atan2(
    Math.cos(φ) * Math.sin(λ),
    Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ),
  );
  const r = (Math.min(width, height) / 2) * (1 - c / Math.PI) ** 2.2;
  const x = width / 2 + r * Math.sin(θ);
  const y = height / 2 - r * Math.cos(θ);
  return [x, y];
};

/** @param {Coord[]} coords @param {Coord} center */
const drawLine = (coords, center) => {
  for (const coord of coords) {
    ctx.lineTo(...projection(coord, center));
  }
};

/** @param {any[]} coords @param {Coord} center */
const drawArr = (coords, center) => {
  if (typeof coords[0][0] === 'number') {
    ctx.beginPath();
    drawLine(coords, center);
    ctx.closePath();
    ctx.stroke();
  } else {
    for (const arr of coords) {
      drawArr(arr, center);
    }
  }
};

/** @type {Array<{properties:{name: string}, geometry: {coordinates: [any]}}>} */
let features;

/** @param {number} time */
const loop = (time) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /** @type {Coord} */
  const center = [time * speed, time * speed];
  // const center = [-98.0, 38.5]; // roughly center of US

  // draw lat/lon lines
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  for (let lon = -180; lon < 180; lon += 15) {
    const coords = /** @type {Coord[]} */ ([]);
    for (let lat = -90; lat <= 90; lat++) coords.push([lon, lat]);
    drawLine(coords, center);
  }
  for (let lat = -90; lat <= 90; lat += 10) {
    const coords = /** @type {Coord[]} */ ([]);
    for (let lon = -180; lon <= 180; lon++) coords.push([lon, lat]);
    drawLine(coords, center);
  }
  ctx.stroke();

  // draw features
  for (let i = 0; i < features.length; i++) {
    ctx.strokeStyle = `hsl(${(i / features.length) * 360}, 100%, 80%)`;
    drawArr(features[i].geometry.coordinates, center);
  }

  requestAnimationFrame(loop);
};

const main = async () => {
  features = (await (await fetch('custom.geo.json')).json()).features;
  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
  requestAnimationFrame(loop);
  console.log(features);
};
main();
