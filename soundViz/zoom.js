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

// Wheel, trackpad pinch and two-finger touch, all landing on the same two
// operations. One finger is left alone: it is how a recording is made.
//
// A gesture only ever re-projects the cloud already in hand, which is instant.
// If the new view wants a finer grid than that cloud was built on, one is
// computed once the gesture stops — and because the grids nest, that pass adds
// cells without moving any, so it reads as detail arriving rather than as the
// picture changing.
export function attachGestures(el, opts) {
  const {getView, setView, getLimits, onGesture, onSettle, onMultiTouch} = opts;

  const rect = () => el.getBoundingClientRect();
  const pointers = new Map();

  let pinch = null;
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
    if (e.pointerType !== 'touch') {
      return;
    }

    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

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
  };
}
