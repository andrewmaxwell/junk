// Modifiers that are already part of the drink's name, or not worth mentioning.
const SILENT_MODS = ['Hot', 'Iced', 'Blended'];

/**
 * @param {any} drink
 * @param {string[]} mods
 */
export function drinkName(drink, mods) {
  if (drink.cold) return drink.name;
  if (mods.includes('Blended')) return `Blended ${drink.name}`;
  if (mods.includes('Iced')) return `Iced ${drink.name}`;
  return drink.name;
}

/** @param {string[]} mods */
export const extras = (mods) => mods.filter((m) => !SILENT_MODS.includes(m));

/**
 * @param {any} drink
 * @param {string[]} mods
 */
export const recipe = (drink, mods) =>
  (mods.includes('Iced') && drink.iced) || drink.recipe;

/**
 * Opens a text to Andrew with the order filled in. The guest still has to
 * hit send, and on a computer this may do nothing at all.
 *
 * @param {any} drink
 * @param {string[]} mods
 */
export function textOrder(drink, mods) {
  const lines = [`☕ New order: ${drinkName(drink, mods)}`];
  if (extras(mods).length) lines.push(extras(mods).join(' · '));
  const body = encodeURIComponent(lines.join('\n'));

  const phone = atob('MzE0MzQxODA4MA==');
  const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
  location.href = `sms:${phone}${separator}body=${body}`;
}
