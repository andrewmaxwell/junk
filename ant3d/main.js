import {Renderer} from './Renderer.js';

const params = {
  speed: 100,
  cellRad: 0.33,
  cameraDistance: 80,
  cameraZoom: 800,
  angX: Math.PI / 2,
  angZ: Math.PI / 0.66,
};

const colors = [
  {color: '#333', turn: 1}, // when encountering a #333 cell, turn once (example: from up to forward)
  {color: 'blue', turn: 2}, // turn twice on blue (example: from up to left)
  {color: 'green', turn: 5},
  {color: '#AAA', turn: 4},
];

const dirs = [
  (a) => a.x--, // right
  (a) => a.y--, // up
  (a) => a.z--, // backward
  (a) => a.x++, // left
  (a) => a.y++, // down
  (a) => a.z++, // forward
];

const toKey = ({x, y, z}) => `${x},${y},${z}`;

const renderer = new Renderer(document.querySelector('canvas'));

let grid, ant;

const reset = () => {
  grid = {};
  ant = {dir: 0, x: 0, y: 0, z: 0};
};

const loop = () => {
  if (document.hasFocus()) {
    for (let i = 0; i < params.speed; ++i) {
      const key = toKey(ant);

      // change dir
      const val = grid[key] || 0;
      ant.dir = (ant.dir + colors[val].turn) % dirs.length;

      // move ant
      dirs[ant.dir](ant);

      // toggle cell
      grid[key] = (val + 1) % colors.length;
    }

    renderer.render(grid, params, colors);
  }

  requestAnimationFrame(loop);
};

window.addEventListener('mousemove', (e) => {
  params.angX = (e.pageX / innerWidth) * 10;
  params.angZ = -(e.pageY / innerHeight) * 10;
});

const gui = new window.dat.GUI();
gui.add(params, 'speed', 0, 1000);
gui.add(params, 'cellRad', 0, 4);
gui.add(params, 'cameraDistance', 0, 500);
gui.add(params, 'cameraZoom', 0, 2000);
gui.add({reset}, 'reset');

reset();
loop();
