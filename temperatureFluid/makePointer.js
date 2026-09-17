/**
 * Pointer interaction. Dragging pushes the fluid; holding shift paints heat
 * and holding alt (or the secondary button) paints cold. Heat and push
 * combine, so shift-dragging pulls a plume along behind the cursor.
 *
 * @type {(
 *   canvas: HTMLCanvasElement,
 *   sim: {
 *     addVelocity: (x: number, y: number, dx: number, dy: number, radius: number) => void,
 *     addHeat: (x: number, y: number, targetTemp: number, rate: number, radius: number) => void,
 *   },
 *   brush: {radius: number, rate: number},
 * ) => void}
 */
export const makePointer = (canvas, sim, brush) => {
  /** Previous position, or null when no drag is in progress. */
  let last = null;

  const positionOf = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const apply = (event) => {
    // `buttons` is a bitmask of what is currently held, so this also ends the
    // drag if the button was released off-canvas and we never saw the pointerup.
    if (!event.buttons) {
      last = null;
      return;
    }
    const point = positionOf(event);
    if (!(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) {
      last = null;
      return;
    }

    // The delta is already in canvas fractions, the units `addVelocity`
    // converts from, so a flick pushes hard and a slow drag nudges. Skipping
    // the first move after pointerdown avoids a spurious shove from wherever
    // the pointer happened to be last.
    if (last && event.buttons & 1) {
      sim.addVelocity(
        point.x,
        point.y,
        point.x - last.x,
        point.y - last.y,
        brush.radius,
      );
    }
    if (event.shiftKey) {
      sim.addHeat(point.x, point.y, 1, brush.rate, brush.radius);
    } else if (event.altKey || event.buttons & 2) {
      sim.addHeat(point.x, point.y, 0, brush.rate, brush.radius);
    }

    last = point;
  };

  canvas.addEventListener('pointerdown', (event) => {
    // Capture so a fast drag that leaves the canvas keeps steering the fluid.
    canvas.setPointerCapture(event.pointerId);
    last = positionOf(event);
    apply(event);
  });
  canvas.addEventListener('pointermove', apply);
  canvas.addEventListener('pointerup', () => {
    last = null;
  });
  canvas.addEventListener('pointercancel', () => {
    last = null;
  });
  // Otherwise the secondary-button cold brush opens a context menu instead.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
};
