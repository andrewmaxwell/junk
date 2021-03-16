const width = 300;
const height = 200;

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

let obs;

const dirs = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

const reset = () => {
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = 'white';

  obs = [];

  const n = 100;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [xs, ys] = dirs[Math.floor(4 * Math.random())];
      obs.push({x: width / 2 - n / 2 + i, y: height / 2 - n / 2 + j, xs, ys});
    }
  }
};

const loop = () => {
  const index = {};

  ctx.clearRect(0, 0, width, height);
  for (const ob of obs) {
    ctx.fillRect(ob.x, ob.y, 1, 1);

    ob.x += ob.xs;
    ob.y += ob.ys;

    if (ob.x <= 0) {
      ob.x = 0;
      ob.xs *= -1;
    } else if (ob.x >= width - 1) {
      ob.x = width - 1;
      ob.xs *= -1;
    }
    if (ob.y <= 0) {
      ob.y = 0;
      ob.ys *= -1;
    } else if (ob.y >= height - 1) {
      ob.y = height - 1;
      ob.ys *= -1;
    }

    const k = ob.x + ',' + ob.y;
    if (!index[k]) index[k] = [];
    index[k].push(ob);
  }

  for (const k in index) {
    if (index[k].length < 2) continue;

    for (const ob of index[k]) {
      [ob.xs, ob.ys] = [ob.ys, -ob.xs];
    }
  }

  requestAnimationFrame(loop);
};

reset();
loop();
