import {Camera} from '../builder/camera.js';

const movementKeys = {
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyW: 'up',
  KeyD: 'right',
  KeyS: 'down',
};

export const viewer = (draw, initialView) => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  const camera = new Camera(initialView);
  // let mouse = {x: 0, y: 0};

  window.addEventListener('click', (e) => {
    // mouse = {...mouse, ...camera.toWorldCoords(e.pageX, e.pageY)};
    console.log(camera.toWorldCoords(e.pageX, e.pageY));
  });

  window.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.changeZoom(e.deltaY);
    },
    {passive: false}
  );

  const pressing = {};
  window.addEventListener('keydown', (e) => {
    if (e.code in movementKeys) {
      e.preventDefault();
      pressing[movementKeys[e.code]] = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code in movementKeys) {
      e.preventDefault();
      pressing[movementKeys[e.code]] = false;
    }
  });

  const resize = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  };
  window.addEventListener('resize', resize);

  const loop = () => {
    camera.move(pressing);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    camera.transform(ctx);
    draw(ctx, camera);
    ctx.restore();
    requestAnimationFrame(loop);
  };

  resize();
  loop();

  return {camera};
};
