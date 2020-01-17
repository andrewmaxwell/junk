const size = 100;
let grid1 = [];
let grid2 = [];
for (let i = 0; i < size; i++) {
  grid1[i] = new Array(size).fill(0);
  grid2[i] = new Array(size).fill(0);
}

[
  [0, 1],
  [0, 0, 0, 1],
  [1, 1, 0, 0, 1, 1, 1]
].forEach((r, i) => {
  r.forEach((c, j) => {
    grid1[size / 2 + i][size / 2 + j] = c;
  });
});

const res = [];
const layers = 10;
for (let z = 0; z < layers; z++) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid1[y][x]) res.push([y, x, layers - z - 1]);
      const up = (y - 1 + size) % size;
      const dn = (y + 1) % size;
      const lt = (x - 1 + size) % size;
      const rt = (x + 1) % size;
      let n =
        grid1[up][lt] +
        grid1[up][x] +
        grid1[up][rt] +
        grid1[dn][lt] +
        grid1[dn][x] +
        grid1[dn][rt] +
        grid1[y][lt] +
        grid1[y][rt];
      grid2[y][x] = grid1[y][x] ? n > 1 && n < 4 : n == 3;
    }
  }
  [grid1, grid2] = [grid2, grid1];
}

const scale = 0.5;
document.body.innerHTML =
  '<pre>' +
  res
    .map(([x, y, z]) => {
      x = ((x - size / 2 - 3) * scale).toFixed(2);
      y = ((y - size / 2 - 2) * scale).toFixed(2);
      z = ((scale + z) * scale).toFixed(2);
      return `m = min(m, sphere(pos - vec3(${x}, ${z}, ${y})));`;
    })
    .join('\n') +
  '</pre>';
