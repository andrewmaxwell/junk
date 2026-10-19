// The controls live in the URL, so a refresh keeps the run and a link shares
// it. Kept free of the DOM so the parsing can be tested in Node.
import {ITEM_SHAPES, CONTAINER_SHAPES} from './shapes.js';

export const LIMITS = {
  count: {min: 3, max: 40},
  aspect: {min: 0.4, max: 2.5},
};

export const DEFAULTS = {
  itemShape: 'square',
  containerShape: 'circle',
  aspect: 1,
  count: 12,
};

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// `Number(null)` and `Number('')` are both 0, so a missing parameter or a
// cleared field would otherwise read as a real zero.
export const toNumber = (text) =>
  text == null || String(text).trim() === '' ? NaN : Number(text);

export function readParams(search) {
  const params = new URLSearchParams(search);
  const pick = (key, table, fallback) =>
    Object.hasOwn(table, params.get(key)) ? params.get(key) : fallback;
  const number = (key, fallback, {min, max}) => {
    const value = toNumber(params.get(key));
    return Number.isFinite(value) ? clamp(value, min, max) : fallback;
  };
  return {
    itemShape: pick('item', ITEM_SHAPES, DEFAULTS.itemShape),
    containerShape: pick(
      'container',
      CONTAINER_SHAPES,
      DEFAULTS.containerShape,
    ),
    aspect: number('aspect', DEFAULTS.aspect, LIMITS.aspect),
    count: Math.round(number('n', DEFAULTS.count, LIMITS.count)),
  };
}

// Aspect only matters to containers that use it, so it is left out otherwise.
export function writeParams(config) {
  const params = new URLSearchParams({
    container: config.containerShape,
    item: config.itemShape,
    n: String(config.count),
  });
  if (CONTAINER_SHAPES[config.containerShape].usesAspect)
    params.set('aspect', String(config.aspect));
  return `?${params}`;
}
