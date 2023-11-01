import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/OrbitControls.js';

export const addControls = ({camera, canvas, render, x, y, z, onClick}) => {
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(x, y, z);
  controls.update();
  controls.addEventListener('change', render);

  canvas.addEventListener(
    'touchstart',
    (event) => event.preventDefault(), // prevent scrolling
    {passive: false}
  );

  if (onClick) {
    const mouse = {x: 0, y: 0};

    const recordMovement = ({clientX, clientY}) => {
      mouse.moveX += Math.abs(mouse.x - clientX);
      mouse.moveY += Math.abs(mouse.y - clientY);
    };

    const doThingIfNoMovement = (event) => {
      if (mouse.moveX < 5 && mouse.moveY < 5) onClick(event);
      window.removeEventListener('pointermove', recordMovement);
      window.removeEventListener('pointerup', doThingIfNoMovement);
    };

    canvas.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        mouse.x = event.clientX;
        mouse.y = event.clientY;
        mouse.moveX = 0;
        mouse.moveY = 0;
        window.addEventListener('pointermove', recordMovement);
        window.addEventListener('pointerup', doThingIfNoMovement);
      },
      {passive: false}
    );
  }
};
