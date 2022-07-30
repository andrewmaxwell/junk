import {Renderer} from './Renderer.js';
import {World} from './World.js';

const params = {
  speed: 0.5,
  gravity: 1,
  steps: 8,
  minRad: 3,
  maxRad: 10,
};

let renderer, world, frame;

// const makeSoftbodyRect = (world, x, y, w, h, rad = 4) => {
//   const balls = [];
//   for (let i = 0; i < h; i++) {
//     balls[i] = [];
//     for (let j = 0; j < w; j++) {
//       balls[i][j] = world.addBall(x + j * rad * 2, y + i * rad * 2, rad);
//     }
//   }

//   for (let i = 0; i < h; i++) {
//     for (let j = 0; j < w; j++) {
//       if (balls[i + 1]) world.link(balls[i][j], balls[i + 1][j]);
//       if (balls[i][j + 1]) world.link(balls[i][j], balls[i][j + 1]);
//       if (balls[i + 1]?.[j + 1]) world.link(balls[i][j], balls[i + 1][j + 1]);
//     }
//   }
// };

const resize = () => {
  renderer.resize();
  world.resize(params);
};

const reset = () => {
  world = new World();
  frame = 0;
  resize();

  for (let i = 0; i < 5; i++) {
    const height = 10 + Math.random() * 500;
    world.addBlock((i + 1) * 200, innerHeight - height, 50, height);
  }

  // makeSoftbodyRect(world, 100, 100, 10, 10);
};

const loop = () => {
  const angle = (frame / 1000) % Math.PI;
  world.addBall(
    innerWidth / 2,
    params.maxRad,
    params.minRad + (params.maxRad - params.minRad) * Math.random(),
    3 * Math.cos(angle),
    3 * Math.sin(angle)
  );

  const start = performance.now();
  world.step(params);
  const iterateTime = Math.round(performance.now() - start);

  renderer.render(world, iterateTime, frame);
  frame++;
  requestAnimationFrame(loop);
};

const init = () => {
  renderer = new Renderer(document.querySelector('canvas'));

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) {
      for (const ball of world.balls) {
        if (Math.hypot(ball.x - e.clientX, ball.y - e.clientY) < 50) {
          ball.x += e.movementX / 10;
          ball.y += e.movementY / 10;
        }
      }
    }
  });

  reset();
  loop();
};

init();
