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

  // world.makeSoftbodyRect(100, 100, 10, 10);
};

const loop = () => {
  if (document.hasFocus()) {
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
  }
  requestAnimationFrame(loop);
};

const init = () => {
  renderer = new Renderer(document.querySelector('canvas'));

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => {
    if (e.buttons !== 1) return;
    for (const ball of world.balls) {
      const dist = Math.hypot(ball.x - e.clientX, ball.y - e.clientY);
      const amt = 0.05 * (1.0 - dist / 100.0);
      if (amt < 0) continue;
      ball.x += e.movementX * amt;
      ball.y += e.movementY * amt;
    }
  });
  window.addEventListener('dblclick', (e) => {
    world.makeSlinky(e.pageX, e.pageY, 300, 400);
  });

  reset();
  loop();
};

init();
