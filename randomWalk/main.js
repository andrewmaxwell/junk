import {viewer} from '../primeSpiral/viewer.js';

const dist = ([a, b], [c, d]) => Math.hypot(a - c, b - d);
const randomEl = (arr) => arr[Math.floor(Math.random() * arr.length)];

const getClosestPoint = (target, coords) =>
  coords.reduce(
    (res, coord, i) =>
      dist(coord, target) < dist(coords[res], target) ? i : res,
    0
  );

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
  return [...path.slice(-10), randomEl(neighbors) || curr];
};

const {coords, paths} = await (await fetch('paths.json')).json();
const adj = buildAdjacencyStructure(paths);

const startingPoint = getClosestPoint([63867, 49079], coords);
let randomPath = [startingPoint];

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

    // ctx.fillStyle = 'white';
    // ctx.font = `100px sans-serif`;
    // for (const path of paths) {
    //   for (let i = 0; i < path.length - 1; i++) {
    //     const curr = path[i];
    //     const next = path[i + 1];
    //     const x = (coords[curr][0] + coords[next][0]) / 2;
    //     const y = (coords[curr][1] + coords[next][1]) / 2;
    //     const len =
    //       Math.round((dist(coords[curr], coords[next]) * 100) / 5.48) / 100;
    //     ctx.fillText(len, x, y);
    //   }
    // }

    // coords.forEach(([x, y], i) => {
    //   ctx.fillStyle = `hsl(${(adj[i].length - 1) * 50}, 100%, 50%)`;
    //   ctx.beginPath();
    //   ctx.arc(x, y, 30, 0, 2 * Math.PI);
    //   ctx.fill();
    // });

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

// const run = () => {
//   let prev;
//   let curr = startingPoint;
//   let totalDist = 0;

//   do {
//     const neighbors = adj[curr].filter((id) => id !== prev);
//     prev = curr;
//     if (neighbors.length) {
//       curr = randomEl(neighbors);
//       totalDist += dist(coords[curr], coords[prev]);
//     }
//   } while (curr !== startingPoint);

//   return totalDist;
// };

// const n = 10000;
// let total = 0;
// for (let i = 0; i < n; i++) total += run();
// console.log((total / n / 5.6 / 5280).toLocaleString());
