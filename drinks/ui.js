const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Swaps the screen's contents, crossfading where the browser supports it.
 * @param {HTMLElement} container
 * @param {string} html
 */
export function show(container, html) {
  const update = () => {
    container.innerHTML = html;
    window.scrollTo(0, 0);
  };
  if (document.startViewTransition && !reduceMotion.matches) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

/** @param {HTMLElement} container */
export function unleashConfetti(container) {
  const burst = document.createElement('div');
  burst.className = 'confetti-container';
  const emojis = ['☕', '✨', '🚀', '🎉', '🍼', '🥵'];

  for (let i = 0; i < 35; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.innerText = emojis[Math.floor(Math.random() * emojis.length)];

    const angle = Math.random() * Math.PI * 2;
    const distance = 100 + Math.random() * 250;
    el.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    el.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    el.style.setProperty('--tr', `${(Math.random() - 0.5) * 360}deg`);
    el.style.animationDelay = `${Math.random() * 0.2}s`;

    burst.appendChild(el);
  }

  container.appendChild(burst);
  setTimeout(() => burst.remove(), 2000);
  navigator.vibrate?.([30, 50, 50, 50, 70, 50, 100]);
}

export function bindMouseTracking() {
  /**
   * @param {number} x -1 to 1
   * @param {number} y -1 to 1
   */
  const moveBlobs = (x, y) => {
    document.body.style.setProperty('--mouse-x', `${x * 125}px`);
    document.body.style.setProperty('--mouse-y', `${y * 125}px`);
  };

  window.addEventListener('pointermove', (e) =>
    moveBlobs(
      (e.clientX / window.innerWidth) * 2 - 1,
      (e.clientY / window.innerHeight) * 2 - 1,
    ),
  );

  // Phones (that allow it) drift the blobs as you tilt them.
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma === null || e.beta === null) return;
    const clamp = (/** @type {number} */ v) => Math.max(-1, Math.min(1, v));
    // People hold phones tilted back about 45 degrees.
    moveBlobs(clamp(e.gamma / 45), clamp((e.beta - 45) / 45));
  });
}

export function bindGlobalHaptics() {
  document.addEventListener('click', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('button')) {
      navigator.vibrate?.(30);
    }
  });
}
