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

/**
 * @param {(
 *  ctx: CanvasRenderingContext2D,
 *  camera: Camera,
 *  mouse: {x: number, y: number, pageX: number, pageY: number, movementX: number, movementY: number}
 * ) => void} draw
 *
 * @param {{
 *  initialView?: {x?: number, y?: number, zoom?: number},
 *  onClick?: (coords: {x: number, y: number}) => void,
 *  onMouseDown?: (coords: {x: number, y: number}) => void,
 *  onMouseUp?: (coords: {x: number, y: number}) => void,
 *  onMouseMove?: (coords: {x: number, y: number}) => void,
 *  drawStatic?: (ctx: CanvasRenderingContext2D) => void
 * }} opts
 */
export const viewer = (
  draw,
  {initialView, onClick, onMouseDown, onMouseUp, onMouseMove, drawStatic} = {},
) => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  const camera = new Camera(initialView);

  const mouse = {x: 0, y: 0, pageX: 0, pageY: 0, movementX: 0, movementY: 0};

  /** @type {(func: ((coords: {x: number, y: number}) => void) | undefined) => (e: MouseEvent) => void} */
  const handle = (func) => (e) => {
    const {x, y} = camera.toWorldCoords(e.pageX, e.pageY);
    mouse.pageX = e.pageX;
    mouse.pageY = e.pageY;
    mouse.movementX = e.movementX;
    mouse.movementY = e.movementY;
    mouse.x = x;
    mouse.y = y;
    func?.(mouse);
  };
  window.addEventListener('mousedown', handle(onMouseDown));
  window.addEventListener('mouseup', handle(onMouseUp));
  window.addEventListener('mousemove', handle(onMouseMove));
  window.addEventListener('click', handle(onClick));

  window.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.changeZoom(e.deltaY);
    },
    {passive: false},
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
    if (document.hasFocus()) {
      camera.move(pressing);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.save();
      camera.transform(ctx);
      draw(ctx, camera, mouse);
      ctx.restore();
      drawStatic?.(ctx);
    }
    requestAnimationFrame(loop);
    // setTimeout(loop, 100); // simulate slow frame rate
  };

  resize();
  loop();

  return {camera};
};
