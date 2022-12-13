import {debounce} from '../misc/debounce.js';
import {projection} from './projection.js';

const calculateSquares = (
  {resolution, scale, cameraZoom, cameraDistance, minX, maxX, minY, maxY, func},
  angX,
  angZ,
  time
) => {
  const project = projection(
    cameraDistance * Math.cos(angX) * Math.sin(angZ), // camera x
    cameraDistance * Math.sin(angX) * Math.sin(angZ), // camera y
    cameraDistance * Math.cos(angZ), // camera z
    Math.PI - angZ, // camera rotation x
    0, // camera rotation y
    (3 * Math.PI) / 2 - angX, // camera rotation z
    0, // camera pointed at x
    0, // camera pointed at y
    cameraZoom
  );

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

  const params =
    location.hash.length > 1
      ? JSON.parse(atob(location.hash.slice(1)))
      : {
          resolution: 32,
          scale: 10,
          cameraZoom: 300,
          cameraDistance: 8,
          minX: -1,
          maxX: 1,
          minY: -5,
          maxY: 5,
          function: `Math.sin(y * time * 0.003 + time / 31) + 0.2 * Math.sin(-y + time / 29) + 0.8 * Math.cos(x * y * 0.74 - time / 43) + 0.9 * Math.sin(x * -6.4 + time / 87)`,
        };

  const createFunc = () => {
    try {
      const f = new Function('x', 'y', 'time', 'return ' + params.function);
      f();
      params.func = f;
    } catch (e) {
      console.error(e);
    }
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

  const save = debounce(() => {
    location.hash = btoa(JSON.stringify(params));
  });

  const gui = new window.dat.GUI();
  gui.add(params, 'resolution', 10, 100, 1).onChange(save);
  gui.add(params, 'scale', 1, 100).onChange(save);
  gui.add(params, 'cameraZoom', 1, 1000).onChange(save);
  gui.add(params, 'cameraDistance', 0, 20).onChange(save);
  gui.add(params, 'minX').onChange(save);
  gui.add(params, 'maxX').onChange(save);
  gui.add(params, 'minY').onChange(save);
  gui.add(params, 'maxY').onChange(save);
  gui.add(params, 'function').onChange(() => {
    createFunc();
    save();
  });

  createFunc();
  loop();
};

main();
