/*
The camera (zoom, pan, follow) and the pointer tools.

Scroll or pinch to zoom in where the pointer is. Drag with the right button,
or shift-drag, to pan, whatever the tool. Double-click to see the whole world
again. With the follow tool, click something and the camera stays on it: each
frame the sim finds the middle of the particles near the camera's center, and
the camera drifts there.
*/

const toolCodes = {stir: 1, pull: 2, push: 3, paint: 4};
const brushTools = Object.keys(toolCodes);

export const tools = [...brushTools, 'follow', 'pan'];

export const makeInput = (canvas, params) => {
  const cam = {x: 0, y: 0, zoom: 1, following: false};
  let width = 1;
  let height = 1;
  const pointer = {down: false, panning: false, x: 0, y: 0, dx: 0, dy: 0};

  const ring = document.createElement('div');
  ring.style.cssText =
    'position:fixed; pointer-events:none; border:1px solid rgba(255,255,255,0.4); border-radius:50%; display:none';
  document.body.append(ring);
  const showRing = () => {
    const size = params.brushSize * 2;
    Object.assign(ring.style, {
      display: brushTools.includes(params.tool) ? 'block' : 'none',
      width: `${size}px`,
      height: `${size}px`,
      left: `${pointer.x - size / 2}px`,
      top: `${pointer.y - size / 2}px`,
    });
  };

  const wrap = (v, size) => ((v % size) + size) % size;
  const toWorld = (sx, sy) => [
    wrap(cam.x + (sx - width / 2) / cam.zoom, width),
    wrap(cam.y + (sy - height / 2) / cam.zoom, height),
  ];

  const resetView = () => {
    cam.x = width / 2;
    cam.y = height / 2;
    cam.zoom = 1;
    cam.following = false;
  };

  const setSize = (w, h) => {
    width = w;
    height = h;
    resetView();
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.panning = e.button === 2 || e.shiftKey || params.tool === 'pan';
    pointer.down = !pointer.panning;
    if (pointer.down && params.tool === 'follow') {
      [cam.x, cam.y] = toWorld(e.clientX, e.clientY);
      cam.following = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const dx = (e.clientX - pointer.x) / cam.zoom;
    const dy = (e.clientY - pointer.y) / cam.zoom;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (pointer.panning) {
      cam.x = wrap(cam.x - dx, width);
      cam.y = wrap(cam.y - dy, height);
      cam.following = false;
    } else if (pointer.down) {
      pointer.dx += dx;
      pointer.dy += dy;
    }
    showRing();
  });

  const release = () => {
    pointer.down = false;
    pointer.panning = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => (ring.style.display = 'none'));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', resetView);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // pinches come as small deltas with ctrlKey
      const speed = e.ctrlKey ? 0.01 : 0.002;
      const zoom = Math.min(
        64,
        Math.max(1, cam.zoom * Math.exp(-e.deltaY * speed)),
      );
      // keep the world point under the pointer where it is, unless following
      if (!cam.following) {
        const [wx, wy] = toWorld(e.clientX, e.clientY);
        cam.x = wrap(wx - (e.clientX - width / 2) / zoom, width);
        cam.y = wrap(wy - (e.clientY - height / 2) / zoom, height);
      }
      cam.zoom = zoom;
    },
    {passive: false},
  );

  /** What the sim needs for this frame's steps. Clears the pointer's motion. */
  const frame = (steps) => {
    const active = pointer.down && toolCodes[params.tool];
    const perStep = 1 / Math.max(1, steps);
    const result = {
      tool: active ? toolCodes[params.tool] : 0,
      pointer: toWorld(pointer.x, pointer.y),
      pointerVel: [pointer.dx * perStep, pointer.dy * perStep],
      brushRadius: params.brushSize / cam.zoom,
      strength: params.strength,
      paintColor: params.paintColor,
      follow: cam.following && {x: cam.x, y: cam.y, radius: params.radius * 4},
    };
    pointer.dx = 0;
    pointer.dy = 0;
    return result;
  };

  /** Moves the camera part way toward the middle of what it's following. */
  const follow = (offset) => {
    if (!offset || !cam.following) return;
    cam.x = wrap(cam.x + offset.x * 0.5, width);
    cam.y = wrap(cam.y + offset.y * 0.5, height);
  };

  return {cam, setSize, resetView, frame, follow, showRing};
};
