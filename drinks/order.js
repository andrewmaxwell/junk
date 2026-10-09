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

const sassyQuotes = [
  'A truly terrible choice.',
  "I'm judging you silently.",
  'Bold of you to assume this will fix you.',
  'Your therapist would disagree.',
  "I'll make it, but I won't respect you for it.",
  'Is this a cry for help?',
  'Blink twice if you need water instead.',
  "Well, nobody's perfect.",
  "Don't say I didn't warn you.",
  "I guess we're doing this.",
  "I've seen better life choices made at 3 AM.",
  "This won't fill the void, but okay.",
  'My condolences to your nervous system.',
  'Processing your order and my disappointment.',
  'Just remember, you did this to yourself.',
  'I question your decision-making skills.',
  'Enjoy your artificially flavored coping mechanism.',
  'Are we absolutely sure about this?',
  'Adding extra judgment at no additional cost.',
  "That's certainly one way to ruin water.",
  "This'll just be our little secret.",
  "I'm going to make this exactly how you asked, which is your true punishment.",
  'If mediocrity had a flavor profile, you just nailed it.',
  'This is the beverage equivalent of replying "k" to a heartfelt text.',
  'Proof that free will was a mistake.',
  'This order is legally considered a crime in three countries.',
  'You could have just asked for a cup of disappointment.',
  'Your order has been received and deeply judged.',
];

export const sassyQuote = () =>
  sassyQuotes[Math.floor(Math.random() * sassyQuotes.length)];
