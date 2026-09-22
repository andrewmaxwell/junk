/** Tracks the pointer over the canvas, in CSS pixels. */
export const trackPointer = (canvas) => {
  const mouse = {x: 0, y: 0, down: false};
  const update = (e, down) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.down = down;
  };
  canvas.addEventListener('pointermove', (e) => update(e, e.buttons === 1));
  canvas.addEventListener('pointerdown', (e) => update(e, true));
  window.addEventListener('pointerup', () => (mouse.down = false));
  return mouse;
};
