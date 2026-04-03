let isTransitioning = false;

export function getIsTransitioning() {
  return isTransitioning;
}

/**
 * Wraps a DOM modification block in a fade out/in sequence
 * @param {HTMLElement | null} appContainer
 * @param {Function} renderFn
 */
export async function transition(appContainer, renderFn) {
  if (!appContainer || isTransitioning) return;
  isTransitioning = true;
  appContainer.classList.add('fade-out');
  await new Promise((resolve) => setTimeout(resolve, 150));

  renderFn();

  appContainer.classList.remove('fade-out');
  appContainer.classList.add('fade-in');

  setTimeout(() => {
    if (appContainer) appContainer.classList.remove('fade-in');
    isTransitioning = false;
  }, 150);
}

/**
 * @param {HTMLElement | null} appContainer
 */
export function unleashConfetti(appContainer) {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  const emojis = ['☕', '✨', '🚀', '🎉', '🍼', '🥵'];

  for (let i = 0; i < 35; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.innerText = emojis[Math.floor(Math.random() * emojis.length)];

    const angle = Math.random() * Math.PI * 2;
    const distance = 100 + Math.random() * 250;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const tr = (Math.random() - 0.5) * 360;

    el.style.setProperty('--tx', `${tx}px`);
    el.style.setProperty('--ty', `${ty}px`);
    el.style.setProperty('--tr', `${tr}deg`);
    el.style.animationDelay = `${Math.random() * 0.2}s`;

    container.appendChild(el);
  }

  if (appContainer) appContainer.appendChild(container);

  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate([30, 50, 50, 50, 70, 50, 100]);
  }
}

export function bindMouseTracking() {
  const updateMouseVars = (
    /** @type {number} */ x,
    /** @type {number} */ y,
  ) => {
    const normX = x / window.innerWidth - 0.5;
    const normY = y / window.innerHeight - 0.5;
    // Scale drastically from 80px up to 250px so they visibly swing!
    document.body.style.setProperty('--mouse-x', `${normX * 250}px`);
    document.body.style.setProperty('--mouse-y', `${normY * 250}px`);
  };

  window.addEventListener('mousemove', (e) =>
    updateMouseVars(e.clientX, e.clientY),
  );
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 0) {
      updateMouseVars(e.touches[0].clientX, e.touches[0].clientY);
    }
  });

  // Tap into phone gyroscope so the blobs drift when the user tilts their mobile device!
  window.addEventListener('deviceorientation', (e) => {
    // gamma is left-to-right tilt in degrees, beta is front-to-back tilt
    if (e.gamma !== null && e.beta !== null) {
      // clamp to roughly +/- 45 degrees
      const normX = Math.max(-1, Math.min(1, e.gamma / 45));
      const normY = Math.max(-1, Math.min(1, (e.beta - 45) / 45)); // Offset 45deg backwards as people hold phones at an angle
      document.body.style.setProperty('--mouse-x', `${normX * 150}px`);
      document.body.style.setProperty('--mouse-y', `${normY * 150}px`);
    }
  });
}

export function bindGlobalHaptics() {
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target && target.closest('.btn')) {
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(40);
      }
    }
  });
}
