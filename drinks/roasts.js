// What the bot says above the drink name. Roasts that match the order win;
// generic ones are the fallback when nothing does.

/**
 * @typedef {{name: string, mods: string[], has: (mod: string) => boolean, toppings: number}} Order
 * @type {[(order: Order) => boolean, string[]][]}
 */
const roasts = [
  // Caffeine
  [
    (o) => o.has('Decaf'),
    [
      'Coffee-flavored water for coffee-flavored people.',
      'All of the ritual, none of the point.',
      'Decaf. The taste of disappointment, without the side effects.',
    ],
  ],
  [
    (o) => o.has('Half-Caf'),
    [
      'Half-caf. Committing to nothing, as usual.',
      'The beverage equivalent of "let\'s keep it casual."',
    ],
  ],

  // Milk
  [
    (o) => o.has('Oat Milk'),
    [
      "Oat milk. Of course it's oat milk.",
      'Oat milk. Did you also tell everyone at the party?',
    ],
  ],

  // Toppings
  [
    (o) => o.has('Stevia'),
    ['Ah yes, the taste of a lie.', 'Stevia: for when sugar is too honest.'],
  ],
  [
    (o) => o.has('Sugar') && o.has('Stevia'),
    ['Sugar AND Stevia? Pick a lane.'],
  ],
  [
    (o) => o.has('Whipped Cream'),
    [
      'Whipped cream. On purpose. As an adult.',
      'Nothing says "I have my life together" like whipped cream.',
    ],
  ],
  [
    (o) => o.toppings >= 3,
    [
      "This isn't a coffee anymore, it's a dessert with a caffeine problem.",
      'Your dentist just felt a disturbance in the Force.',
      'Bold of you to call this a beverage.',
    ],
  ],
  [
    (o) => o.toppings >= 6,
    [
      "I'm not making a drink, I'm building a sundae.",
      'You pressed every button, like a toddler in an elevator.',
    ],
  ],

  // Preparation
  [
    (o) => o.has('Blended'),
    [
      "You could've just said milkshake.",
      "Andrew's neighbors would like a word about the blender.",
    ],
  ],

  // Drinks
  [
    (o) => (o.name === 'Espresso' || o.name === 'Americano') && !o.toppings,
    ['Black. Like your soul.', 'No milk, no sugar, no joy. Respect.'],
  ],
  [
    (o) => o.name === 'Espresso' && o.has('Hot'),
    ['Two shots, no chaser. Who hurt you?'],
  ],
  [
    (o) => o.name === 'Espresso' && o.has('Iced'),
    ['Straight espresso over ice. Seek help.'],
  ],
  [
    (o) => o.name === 'Espresso Tonic',
    ['Yes, it tastes like that on purpose.', 'Ah, a hipster. In my house.'],
  ],
  [(o) => o.name === 'Cortado', ['A cortado. Did you bring your own beret?']],
  [
    (o) => o.name === 'Dirty Chai',
    ["Couldn't choose between coffee and tea, so you chose violence."],
  ],
  [
    (o) => o.name === 'Matcha Latte',
    ['Matcha. Tell me more about your pilates class.'],
  ],
  [
    (o) => o.name === 'Earl Gray Black Tea' && o.has('Hot'),
    ['Tea. Earl Gray. Hot. Engaging now, Captain.'],
  ],
  [
    (o) => o.name === 'Sleepytime Vanilla Tea',
    ["It's not even bedtime. Or is it? I don't know your life."],
  ],
  [
    (o) => o.name === 'Tension Tamer Tea',
    ["Tension Tamer. So we're admitting it."],
  ],
  [
    (o) => o.name === 'Mugwort Tea',
    ["Mugwort. You know that's a weed, right?"],
  ],
  [
    (o) => o.name === 'Mushroom Delight Tea',
    ["Mushroom tea at a coffee bar. I hope you know what you're doing."],
  ],
  [
    (o) => o.name === 'Hot Chocolate' || o.name === 'Vanilla Steamer',
    ['Do you need a juice box and a nap, too?', 'Aww. Look at you, ordering.'],
  ],
  [
    (o) => o.name === 'Glass of Milk',
    ['A glass of milk. Are you eight?', 'Milk. Growing strong bones, are we?'],
  ],
  [
    (o) => o.name === 'Seltzer Water' && !o.toppings,
    ['Spicy water. Living on the edge.'],
  ],
  [
    (o) => o.name === 'Ice Water',
    [
      'Andrew went to barista school (YouTube) for this.',
      'You came to a coffee bar for tap water. Incredible.',
    ],
  ],
  [
    (o) => o.name === 'The Intrusive Thought',
    ["You found the secret menu. That's not a compliment."],
  ],
];

const generic = [
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
  "This'll just be our little secret.",
  "I'm going to make this exactly how you asked, which is your true punishment.",
  'If mediocrity had a flavor profile, you just nailed it.',
  'This is the beverage equivalent of replying "k" to a heartfelt text.',
  'Proof that free will was a mistake.',
  'This order is legally considered a crime in three countries.',
  'You could have just asked for a cup of disappointment.',
  'Your order has been received and deeply judged.',
];

/** @param {string[]} list */
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

/** Toppings and sweeteners: everything that isn't temperature, caffeine, or milk. */
const BASICS = [
  'Hot',
  'Iced',
  'Blended',
  'Half-Caf',
  'Decaf',
  'Whole Milk',
  'Oat Milk',
];

/**
 * @param {any} drink
 * @param {string[]} mods
 */
export function roast(drink, mods) {
  /** @type {Order} */
  const order = {
    name: drink.name,
    mods,
    has: (mod) => mods.includes(mod),
    toppings: mods.filter((m) => !BASICS.includes(m)).length,
  };
  const matches = roasts.flatMap(([when, lines]) => (when(order) ? lines : []));
  return pickOne(matches.length ? matches : generic);
}
