import {menu} from './menu.js';

// An order is a path: the option indexes picked at each question, starting
// from `start`. Everything else (the drink, its modifiers, the chips, the URL)
// is worked out by replaying the path through the menu.

/**
 * @typedef {number[][]} Path
 * @typedef {{nodeId: string, node: any, options: any[]}} Step
 */

/**
 * @param {Path} path
 * @returns {{steps: Step[], nodeId: string | null, drink: any, mods: string[]}}
 *   `nodeId` is the question to ask next, or null when the order is complete.
 *   `steps` stops early if the path doesn't fit the menu.
 */
export function walk(path) {
  /** @type {Step[]} */
  const steps = [];
  /** @type {string | null} */
  let nodeId = 'start';
  let drink = null;
  /** @type {string[]} */
  const mods = [];

  for (const picks of path) {
    const node = menu[nodeId];
    const options = picks.map((i) => node.options[i]);
    const valid = node.multi
      ? options.every((o) => o)
      : options.length === 1 && options[0] && !options[0].surprise;
    if (!valid) break;

    steps.push({nodeId, node, options});
    for (const option of options) {
      if (option.drink) drink = option.drink;
      if (option.mod) mods.push(option.mod);
    }
    nodeId = (node.multi ? node.next : options[0].next) ?? null;
    if (!nodeId) break;
  }

  return {steps, nodeId, drink, mods};
}

/** Walks the menu picking at random, like a friend who can't decide. */
export function randomPath() {
  /** @type {Path} */
  const path = [];
  for (let nodeId = 'start'; nodeId; ) {
    const node = menu[nodeId];
    if (node.multi) {
      path.push(
        node.options.flatMap((/** @type {any} */ _, i) =>
          Math.random() < 0.15 ? [i] : [],
        ),
      );
      nodeId = node.next;
    } else {
      const choices = node.options.flatMap((/** @type {any} */ o, i) =>
        o.surprise || o.secret ? [] : [i],
      );
      const i = choices[Math.floor(Math.random() * choices.length)];
      path.push([i]);
      nodeId = node.options[i].next;
    }
  }
  return path;
}

/** @param {Path} path */
export const toHash = (path) =>
  '#' + path.map((picks) => picks.join('-') || '_').join('.');

/** @returns {Path} */
export function fromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return [];
  return hash
    .split('.')
    .map((s) => (s === '_' ? [] : s.split('-').map(Number)));
}
