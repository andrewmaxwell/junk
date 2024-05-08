const {features} = await (await fetch('custom.geo.json')).json();

features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const width = (canvas.width = innerWidth);
const height = (canvas.height = innerHeight);

const projection = ([lon, lat], [lon0, lat0]) => {
  lon = ((lon - lon0) * Math.PI) / 180;
  lat = (lat * Math.PI) / 180;
  lat0 = (lat0 * Math.PI) / 180;

  const k =
    2 /
    (1 +
      Math.sin(lat0) * Math.sin(lat) +
      Math.cos(lat0) * Math.cos(lat) * Math.cos(lon));
  const x = width * ((k * Math.cos(lat) * Math.sin(lon)) / (2 * Math.PI) + 0.5);
  const y =
    height *
    (1 -
      ((k *
        (Math.cos(lat0) * Math.sin(lat) -
          Math.sin(lat0) * Math.cos(lat) * Math.cos(lon))) /
        (2 * Math.PI) +
        0.5));

  return [x, y];
};

const drawLine = (coords, rotation) => {
  for (const coord of coords) {
    ctx.lineTo(...projection(coord, [rotation, rotation]));
  }
};

const drawArr = (coords, rotation) => {
  if (typeof coords[0][0] === 'number') {
    ctx.beginPath();
    drawLine(coords, rotation);
    ctx.closePath();
    ctx.stroke();
    return;
  }

  for (const arr of coords) {
    drawArr(arr, rotation);
  }
};

let frame = 0;

const loop = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rotation = frame / 10;

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  for (let lon = -180; lon < 180; lon += 15) {
    const coords = [];
    for (let lat = -90; lat <= 90; lat++) coords.push([lon, lat]);
    ctx.beginPath();
    drawLine(coords, rotation);
    ctx.stroke();
  }

  for (let lat = -90; lat <= 90; lat += 10) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon++) coords.push([lon, lat]);
    ctx.beginPath();
    drawLine(coords, rotation);
    ctx.stroke();
  }

  for (let i = 0; i < features.length; i++) {
    ctx.strokeStyle = `hsl(${(i / features.length) * 360}, 100%, 80%)`;
    drawArr(features[i].geometry.coordinates, rotation);
  }
  frame++;
  requestAnimationFrame(loop);
};

loop();
console.log(features);
