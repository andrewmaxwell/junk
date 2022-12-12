import {projection} from './projection.js';

const calculateGrid = (
  project,
  {resolution, scale, minX, maxX, minY, maxY, func},
  time
) => {
  const grid = [];
  for (let i = 0; i < resolution; i++) {
    grid[i] = [];
    for (let j = 0; j < resolution; j++) {
      const x = minX + (j / resolution) * (maxX - minX);
      const y = minY + (i / resolution) * (maxY - minY);
      const val = func(x, y, time);
      grid[i][j] = project(
        (j / resolution - 0.5) * scale,
        (i / resolution - 0.5) * scale,
        val
      );
    }
  }
  return grid;
};

const calculateSquares = (params, angX, angZ, time) => {
  const {resolution, cameraZoom, cameraDistance} = params;
  const project = projection(
    cameraDistance * Math.cos(angX) * Math.sin(angZ),
    cameraDistance * Math.sin(angX) * Math.sin(angZ),
    cameraDistance * Math.cos(angZ),
    Math.PI - angZ,
    0,
    (3 * Math.PI) / 2 - angX,
    0,
    0,
    cameraZoom
  );

  const grid = calculateGrid(project, params, time);

  const squares = [];
  for (let i = 0; i < resolution - 1; i++) {
    for (let j = 0; j < resolution - 1; j++) {
      squares.push({
        points: [
          grid[i][j],
          grid[i + 1][j],
          grid[i + 1][j + 1],
          grid[i][j + 1],
        ],
        z:
          grid[i][j].z +
          grid[i + 1][j].z +
          grid[i + 1][j + 1].z +
          grid[i][j + 1].z,
      });
    }
  }
  return squares.sort((a, b) => b.z - a.z);
};

const render = (canvas, squares) => {
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.translate(innerWidth / 2, innerHeight / 2);
  ctx.strokeStyle = 'white';
  ctx.fillStyle = '#111';
  ctx.lineJoin = 'round';
  for (const {points, z} of squares) {
    if (points.some((p) => p.z <= 0)) continue;
    ctx.beginPath();
    ctx.lineWidth = 40 / z;
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
};

const main = () => {
  const canvas = document.querySelector('canvas');

  const params = {
    resolution: 32,
    scale: 10,
    cameraZoom: 300,
    cameraDistance: 8,
    minX: -1,
    maxX: 1,
    minY: -1,
    maxY: 1,
    function: `Math.sin(y * time * 0.003 + time / 31) + 0.2 * Math.sin(-y + time / 29) + 0.8 * Math.cos(x * y * 0.74 - time / 43) + 0.9 * Math.sin(x * -6.4 + time / 87)`,
  };

  const createFunc = () => {
    params.func = new Function('x', 'y', 'time', 'return ' + params.function);
  };

  let angX = Math.PI / 2;
  let angZ = Math.PI / 0.66;
  let time = 0;

  const loop = () => {
    const squares = calculateSquares(params, angX, angZ, time);
    render(canvas, squares);
    time++;
    requestAnimationFrame(loop);
  };

  const mouseMove = (e) => {
    angX = (e.pageX / innerWidth) * 2 * Math.PI;
    angZ = -(e.pageY / innerHeight) * 2 * Math.PI;
  };
  canvas.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('touchstart', mouseMove);

  const gui = new window.dat.GUI();
  gui.add(params, 'resolution', 10, 100, 1);
  gui.add(params, 'scale', 1, 100);
  gui.add(params, 'cameraZoom', 1, 1000);
  gui.add(params, 'cameraDistance', 0, 20);
  gui.add(params, 'minX');
  gui.add(params, 'maxX');
  gui.add(params, 'minY');
  gui.add(params, 'maxY');
  gui.add(params, 'function').onChange(createFunc);

  createFunc();
  loop();
};

main();
