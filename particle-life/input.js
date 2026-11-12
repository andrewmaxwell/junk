/*
The camera (zoom, pan, follow, glide) and the pointer tools.

The world is a square that wraps around, usually bigger than the screen, and
the camera shows part of it. Scroll or pinch to zoom in where the pointer is.
Drag with two fingers, the right button, or shift held to pan, whatever the
tool. Double-click to see the whole world. With the follow tool, click
something and the camera stays on it: each frame the sim finds the middle of
the particles near the camera's center, and the camera drifts there.
*/

const toolCodes = {stir: 1, pull: 2, push: 3, paint: 4};
const brushTools = Object.keys(toolCodes);

export const tools = [...brushTools, 'follow', 'pan'];

const maxZoom = 64;

export const makeInput = (canvas, params) => {
  const cam = {x: 0, y: 0, zoom: 1, following: false};
  let width = 1;
  let height = 1;
  let world = 1;
  // where the camera is gliding to, if anywhere
  let glide = null;
  const pointer = {down: false, panning: false, x: 0, y: 0, dx: 0, dy: 0};
  // every finger or mouse button that's down, by pointerId
  const touches = new Map();
  let pinch = null;

  const ring = document.createElement('div');
  ring.style.cssText =
    'position:fixed; pointer-events:none; border:1px solid rgba(255,255,255,0.4); border-radius:50%; display:none';
  document.body.append(ring);
  const showRing = () => {
    const size = params.brushSize * 2;
    Object.assign(ring.style, {
      display:
        brushTools.includes(params.tool) && !pinch && pointer.hovering
          ? 'block'
          : 'none',
      width: `${size}px`,
      height: `${size}px`,
      left: `${pointer.x - size / 2}px`,
      top: `${pointer.y - size / 2}px`,
    });
  };

  const wrap = (v) => ((v % world) + world) % world;
  const toWorld = (sx, sy) => [
    wrap(cam.x + (sx - width / 2) / cam.zoom),
    wrap(cam.y + (sy - height / 2) / cam.zoom),
  ];
  // zoomed out any further, the screen would show the same place twice
  const minZoom = () => Math.max(width, height) / world;
  const clampZoom = (z) => Math.min(maxZoom, Math.max(minZoom(), z));

  /** Zooms to `zoom`, keeping the world point under (sx, sy) where it is. */
  const zoomAt = (zoom, sx, sy) => {
    zoom = clampZoom(zoom);
    if (!cam.following) {
      const [wx, wy] = toWorld(sx, sy);
      cam.x = wrap(wx - (sx - width / 2) / zoom);
      cam.y = wrap(wy - (sy - height / 2) / zoom);
    }
    cam.zoom = zoom;
  };

  const panBy = (dx, dy) => {
    cam.x = wrap(cam.x - dx / cam.zoom);
    cam.y = wrap(cam.y - dy / cam.zoom);
    cam.following = false;
    glide = null;
  };

  const resetView = () => {
    glide = {x: world / 2, y: world / 2, zoom: minZoom()};
    cam.following = false;
  };

  /** Moves the camera smoothly to world point (x, y) at this zoom. */
  const glideTo = (x, y, zoom) => {
    glide = {x, y, zoom: clampZoom(zoom)};
    cam.following = false;
  };

  /** Puts the camera there at once. */
  const jumpTo = (x, y, zoom) => {
    Object.assign(cam, {x, y, zoom: clampZoom(zoom), following: false});
    glide = null;
  };

  const setSize = (w, h) => {
    width = w;
    height = h;
    cam.zoom = clampZoom(cam.zoom);
  };

  const setWorld = (size) => {
    world = size;
    cam.x = wrap(cam.x);
    cam.y = wrap(cam.y);
    cam.zoom = clampZoom(cam.zoom);
  };

  const pinchState = () => {
    const [a, b] = [...touches.values()];
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      dist: Math.hypot(a.x - b.x, a.y - b.y),
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (touches.size === 2) {
      // a second finger turns whatever the first was doing into a pinch
      pointer.down = false;
      pointer.panning = false;
      pinch = pinchState();
      showRing();
      return;
    }
    if (touches.size > 2) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.hovering = e.pointerType === 'mouse';
    pointer.panning = e.button === 2 || e.shiftKey || params.tool === 'pan';
    pointer.down = !pointer.panning;
    if (pointer.down) glide = null;
    if (pointer.down && params.tool === 'follow') {
      [cam.x, cam.y] = toWorld(e.clientX, e.clientY);
      cam.following = true;
    }
    showRing();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, {x: e.clientX, y: e.clientY});
    }
    if (pinch) {
      if (touches.size < 2) return;
      const next = pinchState();
      panBy(next.x - pinch.x, next.y - pinch.y);
      if (pinch.dist > 0) {
        zoomAt((cam.zoom * next.dist) / pinch.dist, next.x, next.y);
      }
      pinch = next;
      return;
    }
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.hovering = e.pointerType === 'mouse';
    if (pointer.panning) panBy(dx, dy);
    else if (pointer.down) {
      pointer.dx += dx / cam.zoom;
      pointer.dy += dy / cam.zoom;
    }
    showRing();
  });

  const release = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    pointer.down = false;
    pointer.panning = false;
    if (e.pointerType !== 'mouse') pointer.hovering = false;
    showRing();
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
      glide = null;
      // pinches come as small deltas with ctrlKey
      const speed = e.ctrlKey ? 0.01 : 0.002;
      zoomAt(cam.zoom * Math.exp(-e.deltaY * speed), e.clientX, e.clientY);
    },
    {passive: false},
  );

  /** What the sim needs for this frame's steps. Clears the pointer's motion. */
  const frame = (steps) => {
    if (glide) {
      // the short way around the world
      const dx =
        glide.x - cam.x - world * Math.round((glide.x - cam.x) / world);
      const dy =
        glide.y - cam.y - world * Math.round((glide.y - cam.y) / world);
      const t = 0.06;
      cam.x = wrap(cam.x + dx * t);
      cam.y = wrap(cam.y + dy * t);
      cam.zoom = Math.exp(
        Math.log(cam.zoom) + (Math.log(glide.zoom) - Math.log(cam.zoom)) * t,
      );
      if (
        Math.hypot(dx, dy) * cam.zoom < 0.5 &&
        Math.abs(cam.zoom / glide.zoom - 1) < 0.002
      ) {
        glide = null;
      }
    }
    const active = pointer.down && toolCodes[params.tool];
    const perStep = 1 / Math.max(1, steps);
    const result = {
      tool: active ? toolCodes[params.tool] : 0,
      pointer: toWorld(pointer.x, pointer.y),
      pointerVel: [pointer.dx * perStep, pointer.dy * perStep],
      brushRadius: params.brushSize / cam.zoom,
      strength: params.strength,
      paintColor: params.paintColor,
      // about four interaction radii, the size of a small creature
      follow: cam.following && {x: cam.x, y: cam.y, radius: 48},
    };
    pointer.dx = 0;
    pointer.dy = 0;
    return result;
  };

  /** Moves the camera part way toward the middle of what it's following. */
  const follow = (offset) => {
    if (!offset || !cam.following) return;
    cam.x = wrap(cam.x + offset.x * 0.5);
    cam.y = wrap(cam.y + offset.y * 0.5);
  };

  return {
    cam,
    setSize,
    setWorld,
    resetView,
    glideTo,
    jumpTo,
    frame,
    follow,
    showRing,
    get busy() {
      return pointer.down || pointer.panning || touches.size > 0;
    },
  };
};
