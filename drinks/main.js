import { menuData } from './menu.js';
import { parseStateFromUrl, pushStateToUrl } from './router.js';
import {
  bindGlobalHaptics,
  bindMouseTracking,
  getIsTransitioning,
  transition,
  unleashConfetti,
} from './ui.js';

/**
 * @typedef {Object} OrderState
 * @property {string[]} modifiers
 * @property {string|null} pendingEndpoint
 */

// --- State ---
/** @type {HTMLElement | null} */
let appContainer = null;
/** @type {OrderState | null} */
let currentOrderState = null;
/** @type {any} */
let currentNodeData = null;
/** @type {Set<number>} */
let currentMultiSelections = new Set();
/** @type {string} */
let currentEndpointName = '';
/** @type {string} */
let currentEndpointRecipe = '';

let secretClicks = 0;
/** @type {any} */
let secretTimer = null;

// --- Initialization ---
function initApp() {
  appContainer = document.getElementById('app-container');
  validateMenu();
  bindEvents();
  bindMouseTracking();
  bindGlobalHaptics();

  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.nodeId) {
      transition(appContainer, () => {
        currentOrderState = event.state.orderState;
        currentNodeData = /** @type {any} */ (menuData)[event.state.nodeId];
        const node = currentNodeData;
        if (node && node.isEndpoint) {
          renderEndpoint(node, event.state.orderState, true);
        } else {
          renderNode(event.state.nodeId, event.state.orderState, true);
        }
      });
    } else {
      loadStateFromUrl();
    }
  });

  loadStateFromUrl();
}

function loadStateFromUrl() {
  const {nodeId, state} = parseStateFromUrl();
  const node = /** @type {any} */ (menuData)[nodeId];

  if (nodeId === 'surprise_handler') {
    handleSurprise();
    return;
  }

  transition(appContainer, () => {
    if (node && node.isEndpoint) {
      renderEndpoint(node, state, true);
    } else if (node) {
      renderNode(nodeId, state, true);
    } else {
      renderNode('start', {modifiers: [], pendingEndpoint: null}, true);
    }
  });
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

// --- Event Handlers ---
function bindEvents() {
  if (!appContainer) return;

  appContainer.addEventListener('click', (/** @type {Event} */ e) => {
    if (getIsTransitioning()) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target) return;

    if (target.matches('h1')) {
      secretClicks++;
      if (secretTimer) clearTimeout(secretTimer);
      secretTimer = setTimeout(() => (secretClicks = 0), 1000);

      if (secretClicks === 7) {
        secretClicks = 0;
        transition(appContainer, () => {
          const state = {modifiers: [], pendingEndpoint: null};
          renderEndpoint(
            /** @type {any} */ (menuData).endpoint_secret_menu,
            state,
          );
        });
      }
    } else {
      secretClicks = 0;
    }

    const optionBtn = target.closest('.option-btn');
    const toggleBtn = target.closest('.toggle-btn');

    if (optionBtn) {
      handleOptionClick(/** @type {HTMLElement} */ (optionBtn));
    } else if (toggleBtn) {
      handleToggleClick(/** @type {HTMLElement} */ (toggleBtn));
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

  if (selectedOption.inlineEndpoint) {
    transition(appContainer, () =>
      renderEndpoint(selectedOption.inlineEndpoint, nextOrderState),
    );
    return;
  }

  if (currentNodeData.isModifier && selectedOption.modifierValue) {
    nextOrderState.modifiers.push(selectedOption.modifierValue);
  }

  if (selectedOption.pendingEndpoint) {
    nextOrderState.pendingEndpoint = selectedOption.pendingEndpoint;
  }

  if (selectedOption.next) {
    const nextNode = /** @type {any} */ (menuData)[selectedOption.next];
    if (nextNode && nextNode.isEndpoint) {
      transition(appContainer, () => renderEndpoint(nextNode, nextOrderState));
    } else {
      transition(appContainer, () =>
        renderNode(selectedOption.next, nextOrderState),
      );
    }
  } else {
    if (nextOrderState.pendingEndpoint) {
      const endpointNode = /** @type {any} */ (menuData)[
        nextOrderState.pendingEndpoint
      ];
      transition(appContainer, () =>
        renderEndpoint(endpointNode, nextOrderState),
      );
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

  const submitBtn = document.getElementById('multi-submit-btn');
  if (submitBtn) {
    submitBtn.innerText =
      currentMultiSelections.size === 0 ? 'Skip ➔' : 'Continue 🚀';
  }
}

function handleMultiSubmit() {
  if (!currentOrderState || !currentNodeData) return;

  const nextOrderState = JSON.parse(JSON.stringify(currentOrderState));

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
      transition(appContainer, () => renderEndpoint(nextNode, nextOrderState));
    } else {
      transition(appContainer, () => renderNode(nextNodeId, nextOrderState));
    }
  } else if (nextOrderState.pendingEndpoint) {
    const endpointNode = /** @type {any} */ (menuData)[
      nextOrderState.pendingEndpoint
    ];
    transition(appContainer, () =>
      renderEndpoint(endpointNode, nextOrderState),
    );
  } else {
    console.error('MultiSelect node missing pendingEndpoint!');
  }
}

function handleBack() {
  history.back();
}

function handleRestart() {
  transition(appContainer, () => {
    history.pushState(null, '', '#start');
    renderNode('start', {modifiers: [], pendingEndpoint: null}, true);
  });
}

function handleSurprise() {
  const endpoints = Object.keys(menuData).filter(
    (key) => /** @type {any} */ (menuData)[key].isEndpoint,
  );
  const randomKey = endpoints[Math.floor(Math.random() * endpoints.length)];
  const randomDrink = /** @type {any} */ (menuData)[randomKey];
  renderEndpoint(randomDrink, {modifiers: [], pendingEndpoint: null});
}

function sendOrder() {
  const drinkName = currentEndpointName;
  const recipe = currentEndpointRecipe;

  const bodyText = `Drink: ${drinkName}\nRecipe: ${recipe}\n`;
  const subject = encodeURIComponent('Incoming Coffee Order! ☕');
  const body = encodeURIComponent(bodyText);

  const email = atob('bWVAYW5kcmV3bWF4d2VsbC5kZXY=');

  setTimeout(() => {
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
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

  transition(appContainer, () => {
    if (!appContainer) return;
    appContainer.innerHTML = `
      <div class="animate-in" style="font-size: 3.5rem; margin-bottom: 16px;">🎉</div>
      <h2 class="highlight animate-in" style="animation-delay: 0.05s;">Order Sent!</h2>
      <p class="animate-in" style="animation-delay: 0.1s; color: var(--text-muted); font-size: 1.1rem;">${actionText}<br><br>He has been alerted and is legally obligated to make this.</p>
      <button type="button" class="btn btn-secondary animate-in" style="animation-delay: 0.15s; margin-top: 32px;" id="restart-btn">I panicked, start over 😰</button>
    `;
    setTimeout(() => unleashConfetti(appContainer), 50);
  });
}

// --- Core Rendering Engine ---

/**
 * @param {string} nodeId
 * @param {OrderState} orderState
 * @param {boolean} [isGoingBack=false]
 */
function renderNode(nodeId, orderState, isGoingBack = false) {
  const node = /** @type {any} */ (menuData)[nodeId];

  if (nodeId === 'surprise_handler') {
    handleSurprise();
    return;
  }

  if (node.isEndpoint) {
    renderEndpoint(node, orderState, isGoingBack);
    return;
  }

  if (!isGoingBack) {
    pushStateToUrl(nodeId, orderState);
  }

  currentOrderState = orderState;
  currentNodeData = node;
  currentMultiSelections.clear();

  let html = '';

  if (nodeId === 'start') {
    html += `
      <div class="animate-in" style="font-size: 3.5rem; margin-bottom: 8px;">✨</div>
      <div class="animate-in" style="animation-delay: 0.05s; color: var(--text-muted); font-size: 1rem; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px;">You've regretfully arrived at</div>
      <h1 class="highlight animate-in" style="animation-delay: 0.1s; font-size: 2.8rem; margin-bottom: 12px; line-height: 1.1; cursor: pointer;">Andrew's<br>Coffee Bar</h1>
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
    html += `<button type="button" class="btn animate-in" style="margin-top: 32px; animation-delay: ${node.options.length * 0.05}s" id="multi-submit-btn">Skip ➔</button>`;
  } else {
    node.options.forEach(
      (/** @type {any} */ option, /** @type {number} */ index) => {
        html += `<button type="button" class="btn option-btn animate-in" style="animation-delay: ${index * 0.05}s" data-index="${index}">${option.label}</button>`;
      },
    );
  }

  let actionBarHtml = '';
  if (nodeId !== 'start') {
    actionBarHtml += `<button type="button" class="btn btn-secondary animate-in" style="animation-delay: ${node.options ? node.options.length * 0.05 : 0}s" id="back-btn">Undo</button>`;
    actionBarHtml += `<button type="button" class="btn btn-danger animate-in" style="animation-delay: ${node.options ? (node.options.length + 1) * 0.05 : 0.05}s" id="restart-btn">Start over</button>`;
  }

  if (actionBarHtml) {
    html += `<div class="action-bar">${actionBarHtml}</div>`;
  }

  if (appContainer) appContainer.innerHTML = html;
}

/**
 * @param {any} nodeData
 * @param {OrderState} orderState
 * @param {boolean} [isGoingBack=false]
 */
function renderEndpoint(nodeData, orderState, isGoingBack = false) {
  if (!isGoingBack) {
    const keys = Object.keys(menuData);
    const nodeId =
      keys.find((k) => /** @type {any} */ (menuData)[k] === nodeData) ||
      'start';
    pushStateToUrl(nodeId, orderState);
  }

  let finalDrinkName = nodeData.drinkName;
  if (orderState && orderState.modifiers && orderState.modifiers.length > 0) {
    if (
      orderState.modifiers.includes('Iced') &&
      !finalDrinkName.includes('Iced')
    ) {
      finalDrinkName = `Iced ${finalDrinkName}`;
    }
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
    <h2>A truly terrible choice.</h2>
    <h1 class="highlight animate-in" style="margin-bottom: 16px;">${finalDrinkName}</h1>
    <p class="animate-in" style="animation-delay: 0.1s"><em>(${finalRecipe})</em></p>

    <div class="action-bar animate-in" style="animation-delay: 0.2s;">
      <button type="button" class="btn btn-secondary" id="back-btn">Undo</button>
      <button type="button" class="btn" id="order-btn">Send it</button>
    </div>
  `;
}

// Start the app!
initApp();
