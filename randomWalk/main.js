import {viewer} from '../primeSpiral/viewer.js';

const getClosestPoint = (coord, coords) => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return coords.reduce(
    (res, coord, i) =>
      dist(coord, coord) < dist(coords[res], coord) ? i : res,
    0
  );
};

const buildAdjacencyStructure = (paths) => {
  const adj = {};
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      (adj[path[i]] ||= []).push(path[i + 1]);
      (adj[path[i + 1]] ||= []).push(path[i]);
    }
  }
  return adj;
};

const iteratePath = (path, adj) => {
  const curr = path[path.length - 1];
  const prev = path[path.length - 2];
  const neighbors = adj[curr].filter((id) => id !== prev);
  return [
    ...path.slice(-20),
    neighbors[Math.floor(Math.random() * neighbors.length)] || prev,
  ];
};

const {coords, paths} = await (await fetch('paths.json')).json();
const adj = buildAdjacencyStructure(paths);

let randomPath = [getClosestPoint([64067, 49279], coords)];

viewer(
  (ctx, camera) => {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    for (const path of paths) {
      ctx.moveTo(coords[path[0]][0], coords[path[0]][1]);
      for (const id of path) ctx.lineTo(coords[id][0], coords[id][1]);
    }
    ctx.stroke();

    randomPath = iteratePath(randomPath, adj);

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.beginPath();
    for (const id of randomPath) ctx.lineTo(coords[id][0], coords[id][1]);
    ctx.stroke();
    // console.log(JSON.stringify({x: camera.x, y: camera.y, zoom: camera.zoom}));
  },
  {x: 52467, y: 44779, zoom: 0.01}
);
