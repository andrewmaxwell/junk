export const FIRST_BATCH = '#32_colombian_supremo_26-09-21_1432.alog';
export const ADD_NEW = '__add_new__';
export const DEFAULT_DRINKS = ['Latte', 'Cortado', 'Iced Latte', 'Frappe'];
export const INITIAL_CHOICES = { drinks: DEFAULT_DRINKS, drinkers: ['Andrew'], milks: ['Whole milk', 'None'], batches: [FIRST_BATCH] };

export function unique(values, caseSensitive = false) {
  const seen = new Set();
  return values.filter(value => typeof value === 'string').map(value => value.trim()).filter(value => {
    const key = caseSensitive ? value : value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function localDateTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function timestampWithOffset(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const pad = n => String(n).padStart(2, '0');
  return `${localDateTime(date)}:${pad(date.getSeconds())}${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export function batchLabel(filename) {
  // Presentation only. Always submit the original full filename.
  return filename.replace(/\.alog$/i, '').replaceAll('_', ' · ');
}

export function validateDrink(drink) {
  if (!drink.drink_type.trim()) throw new Error('Enter a drink name.');
  if (!drink.drinker.trim()) throw new Error('Enter a drinker name.');
  if (!drink.milk.trim()) throw new Error('Choose a milk, or None.');
  if (!drink.batch_1_filename.trim()) throw new Error('Choose the first roast batch.');
  if (drink.caffeine === 'Half-caf') {
    if (!drink.batch_2_filename.trim()) throw new Error('Choose the decaf roast batch.');
    if (drink.batch_1_filename === drink.batch_2_filename) throw new Error('Choose two different batches for half-caf.');
  }
  if (!Number.isFinite(Date.parse(drink.drank_at))) throw new Error('Choose a valid date and time.');
  return drink;
}

export function validEndpoint(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function trustedReplyOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'));
  } catch { return false; }
}
