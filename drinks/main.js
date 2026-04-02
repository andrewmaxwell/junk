import {menuData} from './menu.js';

/**
 * @typedef {Object} OrderState
 * @property {string[]} modifiers
 * @property {string|null} pendingEndpoint
 */

// --- State ---
/** @type {HTMLElement | null} */
let appContainer = null;

/** @type {Array<{nodeId: string, orderState: OrderState}>} */
let historyStack = [];

/** @type {OrderState | null} */
let currentOrderState = null;

/** @type {any} */
let currentNodeData = null;

// Global Haptic Feedback Engine
document.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  if (target && target.closest('.btn')) {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(40); // 40ms spin up for linear resonant actuators
    }
  }
});

/** @type {Set<number>} */
let currentMultiSelections = new Set();

/** @type {string} */
let currentEndpointName = '';

/** @type {string} */
let currentEndpointRecipe = '';

/** @type {boolean} */
let isTransitioning = false;

// --- Initialization ---
function initApp() {
  appContainer = document.getElementById('app-container');
  validateMenu();
  bindEvents();
  renderNode('start', {modifiers: [], pendingEndpoint: null});
}

function validateMenu() {
  const keys = Object.keys(menuData);
  keys.forEach((key) => {
    const node = /** @type {any} */ (menuData)[key];
    if (node.options) {
      node.options.forEach(
        (/** @type {any} */ opt, /** @type {number} */ idx) => {
          if (opt.next && !(/** @type {any} */ (menuData)[opt.next])) {
            console.error(
              `VALIDATION ERROR: Node '${key}' option ${idx} points to non-existent next node '${opt.next}'.`,
            );
          }
          if (
            opt.pendingEndpoint &&
            !(/** @type {any} */ (menuData)[opt.pendingEndpoint])
          ) {
            console.error(
              `VALIDATION ERROR: Node '${key}' option ${idx} points to non-existent pendingEndpoint '${opt.pendingEndpoint}'.`,
            );
          }
        },
      );
    }
  });
}

// --- Transitions & UI State ---
/**
 * @param {Function} renderFn
 */
async function transition(renderFn) {
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

// --- Event Handlers ---
function bindEvents() {
  if (!appContainer) return;

  // Mouse/Touch Tracking for Background Blobs
  const updateMouseVars = (
    /** @type {number} */ x,
    /** @type {number} */ y,
  ) => {
    // Normalize to roughly -0.5 to 0.5
    const normX = x / window.innerWidth - 0.5;
    const normY = y / window.innerHeight - 0.5;
    // Set custom CSS variables for transforms
    document.body.style.setProperty('--mouse-x', `${normX * 80}px`);
    document.body.style.setProperty('--mouse-y', `${normY * 80}px`);
  };

  window.addEventListener('mousemove', (e) =>
    updateMouseVars(e.clientX, e.clientY),
  );
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 0) {
      updateMouseVars(e.touches[0].clientX, e.touches[0].clientY);
    }
  });

  // Global Event Delegation
  appContainer.addEventListener('click', (/** @type {Event} */ e) => {
    if (isTransitioning) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target) return;

    if (target.matches('.option-btn')) {
      handleOptionClick(target);
    } else if (target.matches('.toggle-btn')) {
      handleToggleClick(target);
    } else if (target.closest('#multi-submit-btn')) {
      handleMultiSubmit();
    } else if (target.closest('#back-btn')) {
      handleBack();
    } else if (target.closest('#restart-btn')) {
      handleRestart();
    } else if (target.closest('#order-btn')) {
      sendOrder();
    }
  });
}

/**
 * @param {HTMLElement} btn
 */
function handleOptionClick(btn) {
  const optionIndex = parseInt(btn.getAttribute('data-index') || '0', 10);
  const selectedOption = currentNodeData.options[optionIndex];

  /** @type {OrderState} */
  const nextOrderState = currentOrderState
    ? JSON.parse(JSON.stringify(currentOrderState))
    : {modifiers: [], pendingEndpoint: null};

  // 1. Direct inline endpoints skip the rest of the flow
  if (selectedOption.inlineEndpoint) {
    transition(() =>
      renderEndpoint(selectedOption.inlineEndpoint, nextOrderState),
    );
    return;
  }

  // 2. Accumulate modifiers sequentially
  if (currentNodeData.isModifier && selectedOption.modifierValue) {
    nextOrderState.modifiers.push(selectedOption.modifierValue);
  }

  // 3. Track the eventual destination
  if (selectedOption.pendingEndpoint) {
    nextOrderState.pendingEndpoint = selectedOption.pendingEndpoint;
  }

  // 4. Chain to the 'next' question, or hit destination if chain is complete
  if (selectedOption.next) {
    /** @type {any} */
    const nextNode = /** @type {any} */ (menuData)[selectedOption.next];
    if (nextNode && nextNode.isEndpoint) {
      transition(() => renderEndpoint(nextNode, nextOrderState));
    } else {
      transition(() => renderNode(selectedOption.next, nextOrderState));
    }
  } else {
    // Reached the end of the chain, dispatch to pendingEndpoint
    if (nextOrderState.pendingEndpoint) {
      /** @type {any} */
      const endpointNode = /** @type {any} */ (menuData)[
        nextOrderState.pendingEndpoint
      ];
      transition(() => renderEndpoint(endpointNode, nextOrderState));
    } else {
      console.error(
        'Path dead end: No next question or pending endpoint defined!',
      );
    }
  }
}

/**
 * @param {HTMLElement} btn
 */
function handleToggleClick(btn) {
  const indexStr = btn.getAttribute('data-index');
  if (!indexStr) return;
  const index = parseInt(indexStr, 10);

  if (currentMultiSelections.has(index)) {
    currentMultiSelections.delete(index);
    btn.classList.add('btn-secondary');
    btn.innerText = btn.innerText.replace(' ✅', '');
  } else {
    currentMultiSelections.add(index);
    btn.classList.remove('btn-secondary');
    if (!btn.innerText.includes('✅')) btn.innerText = btn.innerText + ' ✅';
  }
}

function handleMultiSubmit() {
  if (!currentOrderState || !currentNodeData) return;

  const nextOrderState = JSON.parse(JSON.stringify(currentOrderState));

  // Apply all toggled modifiers
  currentMultiSelections.forEach((index) => {
    const option = currentNodeData.options[index];
    if (option.modifierValue) {
      nextOrderState.modifiers.push(option.modifierValue);
    }
  });

  if (currentNodeData.multiSelectNext) {
    const nextNodeId = currentNodeData.multiSelectNext;
    const nextNode = /** @type {any} */ (menuData)[nextNodeId];
    if (nextNode && nextNode.isEndpoint) {
      transition(() => renderEndpoint(nextNode, nextOrderState));
    } else {
      transition(() => renderNode(nextNodeId, nextOrderState));
    }
  } else if (nextOrderState.pendingEndpoint) {
    const endpointNode = /** @type {any} */ (menuData)[
      nextOrderState.pendingEndpoint
    ];
    transition(() => renderEndpoint(endpointNode, nextOrderState));
  } else {
    console.error('MultiSelect node missing pendingEndpoint!');
  }
}

function handleBack() {
  historyStack.pop();
  const previousState = historyStack.pop();

  if (previousState) {
    transition(() =>
      renderNode(previousState.nodeId, previousState.orderState),
    );
  } else {
    transition(() =>
      renderNode('start', {modifiers: [], pendingEndpoint: null}),
    );
  }
}

function handleRestart() {
  historyStack = [];
  transition(() => renderNode('start', {modifiers: [], pendingEndpoint: null}));
}

function handleSurprise() {
  /** @type {string[]} */
  const endpoints = Object.keys(menuData).filter(
    (key) => /** @type {any} */ (menuData)[key].isEndpoint,
  );
  const randomKey = endpoints[Math.floor(Math.random() * endpoints.length)];
  const randomDrink = /** @type {any} */ (menuData)[randomKey];

  renderEndpoint(randomDrink, {modifiers: [], pendingEndpoint: null});
}

function unleashConfetti() {
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

  if (navigator.vibrate) {
    navigator.vibrate([30, 50, 50, 50, 70, 50, 100]);
  }
}

function sendOrder() {
  const drinkName = currentEndpointName;
  const recipe = currentEndpointRecipe;

  const bodyText = `Drink: ${drinkName}\nRecipe: ${recipe}\n`;

  const body = encodeURIComponent(bodyText);

  // iOS strictly requires '&' instead of '?' for sms link body parameters
  const isIOS =
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !(/** @type {any} */ (window).MSStream);
  const separator = isIOS ? '&' : '?';

  setTimeout(() => {
    window.location.href = `sms:+13143418080${separator}body=${body}`;
  }, 2000);

  const isTea =
    drinkName.toLowerCase().includes('tea') ||
    drinkName.toLowerCase().includes('matcha');
  const isCocoa =
    drinkName.toLowerCase().includes('chocolate') ||
    drinkName.toLowerCase().includes('cocoa');

  let actionText = 'Andrew is violently assaulting the espresso grinder.';
  if (isTea) actionText = 'Andrew is gently coaxing the kettle to life.';
  if (isCocoa) actionText = 'Andrew is warming up the choccy milk.';

  transition(() => {
    if (!appContainer) return;
    appContainer.innerHTML = `
      <div class="animate-in" style="font-size: 3.5rem; margin-bottom: 16px;">🎉</div>
      <h2 class="highlight animate-in" style="animation-delay: 0.05s;">Order Sent!</h2>
      <p class="animate-in" style="animation-delay: 0.1s; color: var(--text-muted); font-size: 1.1rem;">${actionText}<br><br>He has been alerted and is legally obligated to make this.</p>
      <button type="button" class="btn btn-secondary animate-in" style="animation-delay: 0.15s; margin-top: 32px;" id="restart-btn">I panicked, start over 😰</button>
    `;
    setTimeout(unleashConfetti, 50);
  });
}

// --- Core Rendering Engine ---

/**
 * @param {string} nodeId
 * @param {OrderState} orderState
 * @param {boolean} [isGoingBack=false]
 */
function renderNode(nodeId, orderState, isGoingBack = false) {
  /** @type {any} */
  const node = /** @type {any} */ (menuData)[nodeId];

  if (!isGoingBack) {
    historyStack.push({
      nodeId,
      orderState: JSON.parse(JSON.stringify(orderState)),
    });
  }

  if (nodeId === 'surprise_handler') {
    handleSurprise();
    return;
  }

  if (node.isEndpoint) {
    renderEndpoint(node, orderState);
    return;
  }

  currentOrderState = orderState;
  currentNodeData = node;
  currentMultiSelections.clear();

  let html = '';

  if (nodeId === 'start') {
    html += `
      <div class="animate-in" style="font-size: 3.5rem; margin-bottom: 8px;">✨</div>
      <div class="animate-in" style="animation-delay: 0.05s; color: var(--text-muted); font-size: 1rem; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px;">Welcome to</div>
      <h1 class="highlight animate-in" style="animation-delay: 0.1s; font-size: 2.8rem; margin-bottom: 12px; line-height: 1.1;">Andrew's<br>Coffee Bar</h1>
      <p class="animate-in" style="animation-delay: 0.15s; margin-bottom: 32px; font-size: 1.1rem;">${node.question}</p>
    `;
  } else {
    html += `<h2>${node.question}</h2>`;
  }

  if (node.multiSelect) {
    node.options.forEach(
      (/** @type {any} */ option, /** @type {number} */ index) => {
        html += `<button type="button" class="btn btn-secondary toggle-btn animate-in" style="animation-delay: ${index * 0.05}s" data-index="${index}">${option.label}</button>`;
      },
    );
    html += `<button type="button" class="btn animate-in" style="margin-top: 32px; animation-delay: ${node.options.length * 0.05}s" id="multi-submit-btn">Continue 🚀</button>`;
  } else {
    node.options.forEach(
      (/** @type {any} */ option, /** @type {number} */ index) => {
        html += `<button type="button" class="btn option-btn animate-in" style="animation-delay: ${index * 0.05}s" data-index="${index}">${option.label}</button>`;
      },
    );
  }

  let actionBarHtml = '';
  if (historyStack.length > 1) {
    actionBarHtml += `<button type="button" class="btn btn-secondary animate-in" style="animation-delay: ${node.options.length * 0.05}s" id="back-btn">Wait, undo! 🔙</button>`;
  }

  if (nodeId !== 'start') {
    actionBarHtml += `<button type="button" class="btn btn-danger animate-in" style="animation-delay: ${(node.options.length + 1) * 0.05}s" id="restart-btn">I panicked, start over 😰</button>`;
  }

  if (actionBarHtml) {
    html += `<div class="action-bar">${actionBarHtml}</div>`;
  }

  if (appContainer) appContainer.innerHTML = html;
}

/**
 * @param {any} nodeData
 * @param {OrderState} orderState
 */
function renderEndpoint(nodeData, orderState) {
  let finalDrinkName = nodeData.drinkName;
  // If there are accumulated modifiers, neatly list them out
  if (orderState && orderState.modifiers && orderState.modifiers.length > 0) {
    // Treat 'Iced' specially by prepending it to the base drink name
    if (
      orderState.modifiers.includes('Iced') &&
      !finalDrinkName.includes('Iced')
    ) {
      finalDrinkName = `Iced ${finalDrinkName}`;
    }

    // Omit formatting "Regular", "Hot", and "Iced". Keep the others.
    const activeModifiers = orderState.modifiers.filter(
      (m) => m !== 'Regular' && m !== 'Hot' && m !== 'Iced',
    );
    if (activeModifiers.length > 0) {
      finalDrinkName = `${finalDrinkName} (with ${activeModifiers.join(', ')})`;
    }
  }

  currentEndpointName = finalDrinkName;

  let finalRecipe = nodeData.recipe;
  if (
    orderState &&
    orderState.modifiers &&
    orderState.modifiers.includes('Iced') &&
    !finalRecipe.toLowerCase().includes('ice')
  ) {
    finalRecipe = finalRecipe.replace(/\.$/, '') + ', served over ice.';
  }
  currentEndpointRecipe = finalRecipe;

  if (!appContainer) return;
  appContainer.innerHTML = `
    <div class="animate-in" style="font-size: 3.5rem; margin-bottom: 8px;">✨</div>
    <h2>Great choice!</h2>
    <p>We are spinning up a:</p>
    <h1 class="highlight animate-in" style="margin-bottom: 16px;">${finalDrinkName}</h1>
    <p class="animate-in" style="animation-delay: 0.1s"><em>(${finalRecipe})</em></p>

    <div class="action-bar animate-in" style="animation-delay: 0.2s;">
      <button type="button" class="btn btn-secondary" id="back-btn">Wait, undo! 🔙</button>
      <button type="button" class="btn" id="order-btn">Summon Andrew 🚀</button>
    </div>
  `;
}

// Start the app!
initApp();
