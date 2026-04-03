import {menuData} from './menu.js';

/**
 * @typedef {Object} OrderState
 * @property {string[]} modifiers
 * @property {string|null} pendingEndpoint
 */

/**
 * Push the current menu state into the URL History API
 * @param {string} nodeId
 * @param {OrderState} orderState
 */
export function pushStateToUrl(nodeId, orderState) {
  const params = new URLSearchParams();
  if (orderState.modifiers && orderState.modifiers.length > 0) {
    params.set('mods', orderState.modifiers.join('|'));
  }
  if (orderState.pendingEndpoint) {
    params.set('e', orderState.pendingEndpoint);
  }
  const qs = params.toString();
  const hash = `#${nodeId}${qs ? '?' + qs : ''}`;
  if (window.location.hash !== hash) {
    history.pushState({nodeId, orderState}, '', hash);
  }
}

/**
 * Parses the current window.location hash into a valid App State
 * @returns {{nodeId: string, state: OrderState}}
 */
export function parseStateFromUrl() {
  const hash = window.location.hash.substring(1);
  const defaultPayload = {
    nodeId: 'start',
    state: {modifiers: [], pendingEndpoint: null},
  };

  if (!hash) {
    return defaultPayload;
  }

  const [nodeId, query] = hash.split('?');
  const node = /** @type {any} */ (menuData)[nodeId];

  if (!node && nodeId !== 'surprise_handler') {
    return defaultPayload;
  }

  const params = new URLSearchParams(query || '');
  const modsRaw = params.get('mods');
  const modifiers = modsRaw ? modsRaw.split('|') : [];
  const pendingEndpoint = params.get('e') || null;
  const state = {modifiers, pendingEndpoint};

  return {nodeId, state};
}
