import {example, sanitize, MODEL_VERSION} from './model.js';
// The plan is saved on this device and in the URL hash, so the page address
// reproduces it in any browser. Both carry the full weights, so retuning the
// defaults never changes an old plan.
const STORAGE_KEY = 'care-v5';
export function encode(st) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({...st, v: MODEL_VERSION}),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function decode(hash) {
  const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
// Links and saves are untrusted: sanitize() rebuilds them from known fields,
// so nothing from them reaches innerHTML except plain values.
export function readLink() {
  try {
    return location.hash.length > 1
      ? sanitize(decode(location.hash.slice(1)))
      : null;
  } catch {
    return null; // A mangled link.
  }
}
function readSave() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY))?.state);
  } catch {
    return null; // An unreadable save.
  }
}
// A link wins over this device's plan.
export const loadState = () => readLink() || readSave() || example();
// Returns false when the browser won't store anything.
export function save(state) {
  try {
    history.replaceState(null, '', '#' + encode(state));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({state: {...state, v: MODEL_VERSION}}),
    );
    return true;
  } catch {
    return false;
  }
}
