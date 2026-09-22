/**
 * Tracks the pointer over the canvas, in CSS pixels. Left-drag paints food;
 * right-drag or shift-drag erases it. lastX/lastY is where the brush was at
 * the last simulation step, so each step paints the whole segment since then.
 */
export const trackPointer = (canvas) => {
  const mouse = {x: 0, y: 0, lastX: 0, lastY: 0, mode: 'off'};
  const update = (e) => {
    const wasOff = mouse.mode === 'off';
    if (e.buttons & 2 || (e.buttons & 1 && e.shiftKey)) mouse.mode = 'erase';
    else if (e.buttons & 1) mouse.mode = 'food';
    else mouse.mode = 'off';
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    // A new stroke starts where the pointer is, not where the last one ended.
    if (wasOff) [mouse.lastX, mouse.lastY] = [mouse.x, mouse.y];
  };
  canvas.addEventListener('pointermove', update);
  canvas.addEventListener('pointerdown', update);
  window.addEventListener('pointerup', update);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return mouse;
};
