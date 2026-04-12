/**
 * Applies active modifiers to the base drink name.
 *
 * @param {string} baseDrinkName
 * @param {string[]|undefined} modifiers
 * @returns {string} The final display name of the drink
 */
export function formatDrinkName(baseDrinkName, modifiers) {
  let finalDrinkName = baseDrinkName;

  if (modifiers && modifiers.length > 0) {
    let hasIce = modifiers.includes('Iced');
    let hasBlend = modifiers.includes('Blended');

    if (hasBlend) {
      if (finalDrinkName.includes('Iced ')) {
        finalDrinkName = finalDrinkName.replace('Iced ', 'Blended ');
      } else if (!finalDrinkName.includes('Blended ')) {
        finalDrinkName = `Blended ${finalDrinkName}`;
      }
    } else if (hasIce && !finalDrinkName.includes('Iced')) {
      finalDrinkName = `Iced ${finalDrinkName}`;
    }

    const activeModifiers = modifiers.filter(
      (m) => m !== 'Regular' && m !== 'Hot' && m !== 'Iced' && m !== 'Blended',
    );

    if (activeModifiers.length > 0) {
      finalDrinkName = `${finalDrinkName} (with ${activeModifiers.join(', ')})`;
    }
  }

  return finalDrinkName;
}

/**
 * Mutates the base recipe string to incorporate preparation modifiers.
 *
 * @param {string} baseRecipe
 * @param {string[]|undefined} modifiers
 * @returns {string} The formatted recipe string
 */
export function formatRecipe(baseRecipe, modifiers) {
  let finalRecipe = baseRecipe;

  if (modifiers) {
    const isBlended = modifiers.includes('Blended');
    const isIced = modifiers.includes('Iced');

    if (isBlended) {
      if (finalRecipe.toLowerCase().includes('over ice.')) {
        finalRecipe = finalRecipe.replace(/over ice\./i, 'blended with ice.');
      } else if (finalRecipe.toLowerCase().includes('over ice')) {
        finalRecipe = finalRecipe.replace(/over ice/i, 'blended with ice');
      } else if (!finalRecipe.toLowerCase().includes('blend')) {
        finalRecipe = finalRecipe.replace(/\.$/, '') + ', blended with ice.';
      }
    } else if (isIced && !finalRecipe.toLowerCase().includes('ice')) {
      finalRecipe = finalRecipe.replace(/\.$/, '') + ', served over ice.';
    }
  }

  return finalRecipe;
}

/**
 * @returns {string} A randomly selected sassy quote.
 */
export function getRandomSassyQuote() {
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
  return sassyQuotes[Math.floor(Math.random() * sassyQuotes.length)];
}
