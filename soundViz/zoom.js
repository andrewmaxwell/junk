// The viewport is expressed in the units of the sound itself — samples across,
// hertz up — not in pixels. That is what lets a zoom mean "analyse this stretch
// of audio again, more finely" rather than "make these pixels bigger".

export function fullView(limits) {
  return {t0: limits.tMin, t1: limits.tMax, f0: limits.fMin, f1: limits.fMax};
}

export function isFullView(view, limits) {
  return (
    view.t0 <= limits.tMin &&
    view.t1 >= limits.tMax &&
    view.f0 <= limits.fMin &&
    view.f1 >= limits.fMax
  );
}

function clamp(view, limits) {
  let {t0, t1, f0, f1} = view;

  const maxSpan = limits.tMax - limits.tMin;
  let span = Math.min(Math.max(t1 - t0, Math.min(limits.minSpan, maxSpan)), maxSpan);

  const centre = (t0 + t1) / 2;
  t0 = centre - span / 2;
  t1 = centre + span / 2;

  if (t0 < limits.tMin) {
    t1 += limits.tMin - t0;
    t0 = limits.tMin;
  }

  if (t1 > limits.tMax) {
    t0 -= t1 - limits.tMax;
    t1 = limits.tMax;
  }

  t0 = Math.max(t0, limits.tMin);

  const maxRatio = limits.fMax / limits.fMin;
  let ratio = Math.min(Math.max(f1 / f0, Math.min(limits.minRatio, maxRatio)), maxRatio);

  const mid = Math.sqrt(f0 * f1);
  f0 = mid / Math.sqrt(ratio);
  f1 = mid * Math.sqrt(ratio);

  if (f0 < limits.fMin) {
    f1 *= limits.fMin / f0;
    f0 = limits.fMin;
  }

  if (f1 > limits.fMax) {
    f0 *= limits.fMax / f1;
    f1 = limits.fMax;
  }

  f0 = Math.max(f0, limits.fMin);

  return {t0, t1, f0, f1};
}

// (u, v) are fractions of the canvas, v measured downwards from the top. The
// point under the cursor is the fixed point of the transformation.
export function zoomAt(view, u, v, factor, limits) {
  const tAt = view.t0 + u * (view.t1 - view.t0);
  const span = (view.t1 - view.t0) / factor;

  const l0 = Math.log(view.f0);
  const l1 = Math.log(view.f1);
  const lAt = l0 + (1 - v) * (l1 - l0);
  const lSpan = (l1 - l0) / factor;

  return clamp(
    {
      t0: tAt - u * span,
      t1: tAt + (1 - u) * span,
      f0: Math.exp(lAt - (1 - v) * lSpan),
      f1: Math.exp(lAt + v * lSpan),
    },
    limits,
  );
}

// du, dv are fractions of the canvas to move the *content* by.
export function panBy(view, du, dv, limits) {
  const span = view.t1 - view.t0;
  const l0 = Math.log(view.f0);
  const l1 = Math.log(view.f1);
  const lSpan = l1 - l0;

  return clamp(
    {
      t0: view.t0 - du * span,
      t1: view.t1 - du * span,
      f0: Math.exp(l0 + dv * lSpan),
      f1: Math.exp(l1 + dv * lSpan),
    },
    limits,
  );
}

export function zoomFactor(view, limits) {
  return (limits.tMax - limits.tMin) / (view.t1 - view.t0);
}

// How far a press may wander before it is a pan rather than a hold. Generous,
// because a finger resting on glass is never quite still.
const DRAG_SLOP = 8;

// Wheel, trackpad pinch, two-finger touch and single-pointer drag, all landing
// on the same two operations.
//
// A single pointer is only taken as a pan when there is something to pan —
// otherwise it belongs to the recorder, which owns every press made at full
// view. `canPan` is asked once per press so the two cannot disagree.
//
// A gesture only ever re-projects the cloud already in hand, which is instant.
// If the new view wants a finer grid than that cloud was built on, one is
// computed once the gesture stops — and because the grids nest, that pass adds
// cells without moving any, so it reads as detail arriving rather than as the
// picture changing.
export function attachGestures(el, opts) {
  const {getView, setView, getLimits, onGesture, onSettle, onMultiTouch, canPan, onDragStart} =
    opts;

  const rect = () => el.getBoundingClientRect();
  const pointers = new Map();

  let pinch = null;
  let drag = null;
  let settleTimer = null;

  function settleLater() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(onSettle, 400);
  }

  // Lifting two fingers off a pinch produces two pointerups in quick
  // succession, which is indistinguishable from a double tap unless we
  // remember that a second finger was involved.
  let multiUntil = 0;

  el.addEventListener(
    'wheel',
    e => {
      e.preventDefault();

      const r = rect();
      const u = (e.clientX - r.left) / r.width;
      const v = (e.clientY - r.top) / r.height;

      // Line and page deltas are not pixels; normalise before scaling.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;

      if (e.shiftKey) {
        setView(panBy(getView(), (-e.deltaY * unit) / r.width, 0, getLimits()));
      } else {
        // A trackpad pinch arrives as a wheel event with ctrlKey set and much
        // smaller deltas than a mouse wheel's notches.
        const gain = e.ctrlKey ? 0.02 : 0.0022;
        setView(zoomAt(getView(), u, v, Math.exp(-e.deltaY * unit * gain), getLimits()));
      }

      onGesture();
      settleLater();
    },
    {passive: false},
  );

  el.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

    // Decided here and not revisited: whether this press is allowed to become
    // a pan is a property of the view it started in.
    drag = pointers.size === 1 && canPan() ? {x: e.clientX, y: e.clientY, moved: false} : null;

    if (e.pointerType !== 'touch') {
      return;
    }

    if (pointers.size >= 2) {
      multiUntil = performance.now() + 500;
    }

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      onMultiTouch();
      onGesture();
    }
  });

  el.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) {
      return;
    }

    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

    if (pointers.size === 1 && drag) {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_SLOP) {
          return;
        }

        // Past the slop the gesture has declared itself, and whatever the press
        // had begun is no longer wanted.
        drag.moved = true;
        onDragStart();
      }

      const r = rect();

      setView(
        panBy(
          getView(),
          (e.clientX - drag.x) / r.width,
          (e.clientY - drag.y) / r.height,
          getLimits(),
        ),
      );

      drag.x = e.clientX;
      drag.y = e.clientY;

      onGesture();
      settleLater();

      return;
    }

    if (pointers.size !== 2 || !pinch) {
      return;
    }

    multiUntil = performance.now() + 500;

    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;

    const r = rect();
    const u = (cx - r.left) / r.width;
    const v = (cy - r.top) / r.height;

    let view = panBy(getView(), (cx - pinch.cx) / r.width, (cy - pinch.cy) / r.height, getLimits());

    if (pinch.dist > 0 && dist > 0) {
      view = zoomAt(view, u, v, dist / pinch.dist, getLimits());
    }

    setView(view);
    pinch = {dist, cx, cy};

    onGesture();
    settleLater();
  });

  function lift(e) {
    if (!pointers.delete(e.pointerId)) {
      return;
    }

    if (pointers.size < 2) {
      pinch = null;
    }

    if (pointers.size === 0) {
      drag = null;
    }
  }

  el.addEventListener('pointerup', lift);
  el.addEventListener('pointercancel', lift);

  el.addEventListener('dblclick', e => {
    e.preventDefault();
    setView(fullView(getLimits()));
    onGesture();
    onSettle();
  });

  // Two-finger tap, the touch equivalent of a double click.
  let lastTap = 0;

  el.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') {
      return;
    }

    const now = performance.now();

    if (pointers.size > 0 || now < multiUntil) {
      lastTap = 0;
      return;
    }

    if (now - lastTap < 300) {
      setView(fullView(getLimits()));
      onGesture();
      onSettle();
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });

  return {
    pointerCount: () => pointers.size,

    // The press has committed to something else — a recording — so it is no
    // longer a candidate for a pan. Without this a hand that drifts *after* the
    // take has started would be read as a drag and throw the take away.
    cancelDrag: () => {
      drag = null;
    },
  };
}
