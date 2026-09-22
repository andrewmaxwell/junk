import {defaults, flatten, params} from './params.js';

// The URL hash holds every param that differs from its default, e.g.
// #species.1.distance=12&view.brightness=1.5, so the address is always a
// shareable link to the current settings.

const format = (v) => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(Math.round).join(',');
  return String(Number(v.toPrecision(4)));
};

const defaultValues = new Map(flatten(defaults));

export const encodeParams = () =>
  flatten(params)
    .map(([path, v]) => [path, format(v)])
    .filter(([path, v]) => v !== format(defaultValues.get(path)))
    .map(([path, v]) => `${path}=${v}`)
    .join('&');

/** Returns a partial params object for setParams; ignores unknown or invalid entries. */
export const decodeParams = (hash) => {
  const overrides = {};
  for (const [path, text] of new URLSearchParams(hash)) {
    const fallback = defaultValues.get(path);
    if (fallback === undefined) continue;
    let value = text;
    if (typeof fallback !== 'string') {
      value = Array.isArray(fallback)
        ? text.split(',').map(Number)
        : Number(text);
      const values = [value].flat();
      if (values.some((n) => !Number.isFinite(n))) continue;
      if (Array.isArray(fallback) && values.length !== fallback.length) {
        continue;
      }
    }

    const keys = path.split('.');
    let target = overrides;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    target[keys.at(-1)] = value;
  }
  return overrides;
};

let lastHash = location.hash.slice(1);
let timer;

/** Updates the hash to match params (debounced, without adding history entries). */
export const syncUrl = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    lastHash = encodeParams();
    history.replaceState(
      null,
      '',
      lastHash ? `#${lastHash}` : location.pathname,
    );
  }, 300);
};

/** Calls back with decoded params when the hash is changed by hand or by a pasted link. */
export const onUrlChange = (callback) => {
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1);
    if (hash !== lastHash) {
      lastHash = hash;
      callback(decodeParams(hash));
    }
  });
};
