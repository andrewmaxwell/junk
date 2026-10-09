// The menu is a tree of questions. Each option can:
//   next   - the question to ask after it (omit to finish the order)
//   drink  - the drink being ordered
//   mod    - a modifier added to the order (milk, decaf, syrup...)
//   chip   - what the "choices so far" row shows, if not the mod or drink name
//   group  - a heading to list the option under
// A question with `multi` lets you pick any number of options, then goes to `next`.

const GRINDER = 'Andrew is violently assaulting the espresso grinder.';
const KETTLE = 'Andrew is gently coaxing the kettle to life.';
const FRIDGE = 'Andrew is rummaging around in the fridge.';

// `recipe` is shown under the drink name; `iced` replaces it when served cold.
// `cold` drinks are always cold, so they never get an "Iced" prefix.
const espresso = {
  name: 'Espresso',
  recipe: 'Two shots of pure, undiluted chaos. Good luck.',
  iced: 'A violent shock to your system. Cold and completely unforgiving.',
  making: GRINDER,
};
const americano = {
  name: 'Americano',
  recipe: 'Watered-down anxiety for people who fear flavor.',
  iced: 'Cold, watery, and emotionally distant. Just like my ex.',
  making: GRINDER,
};
const cortado = {
  name: 'Cortado',
  recipe:
    'For when you want to look sophisticated but actually just want a tiny latte.',
  iced: 'A tiny latte that is also cold. Sophistication levels: unclear.',
  making: GRINDER,
};
const latte = {
  name: 'Latte',
  recipe:
    'Mashed up roasted beans disguised by an ocean of warm mammal or plant extract.',
  iced: 'The basic lifeline. 80% ice, 20% personality.',
  making: GRINDER,
};
const espressoTonic = {
  name: 'Espresso Tonic',
  recipe: 'Double shot poured over iced seltzer. Hipster nonsense.',
  making: GRINDER,
  cold: true,
};
const dirtyChai = {
  name: 'Dirty Chai',
  recipe: 'Sweet, spicy goodness deliberately ruined by aggressive bean juice.',
  iced: 'A confused icy beverage going through a severe identity crisis.',
  making: GRINDER,
};
const matcha = {
  name: 'Matcha Latte',
  recipe: 'Fancy green swamp water, gently heated.',
  iced: 'Cold, mathematically whisked green sludge.',
  making: 'Andrew is whisking the matcha into submission.',
};
const chai = {
  name: 'Chai Latte',
  recipe: "Spicy milk that thinks it's better than you.",
  iced: 'Cold spicy milk. Basically a liquid candle.',
  making: 'Andrew is steaming the spicy milk.',
};
const hotChocolate = {
  name: 'Hot Chocolate',
  recipe: 'Melted chocolate masquerading as a morning routine.',
  making: 'Andrew is warming up the choccy milk.',
};
const steamer = {
  name: 'Vanilla Steamer',
  recipe: 'Literally just hot milk. Are you a Victorian child with a cold?',
  making: 'Andrew is steaming the milk.',
};
const glassOfMilk = {
  name: 'Glass of Milk',
  recipe: 'Cold milk poured directly into a glass. Classic.',
  making: FRIDGE,
  cold: true,
};
const seltzer = {
  name: 'Seltzer Water',
  recipe: 'Bubbly seltzer water over ice.',
  making: FRIDGE,
  cold: true,
};
const iceWater = {
  name: 'Ice Water',
  recipe: 'For turning into pee.',
  making: 'Andrew is filling a glass with ice water. Gourmet.',
  cold: true,
};
const intrusiveThought = {
  name: 'The Intrusive Thought',
  recipe:
    'A feral mixture of fresh espresso and raw matcha powder, violently dry-shaken until it forms a gritty paste, then topped with carbonated seltzer. Tastes like a Tuesday afternoon panic attack.',
  making: 'Andrew is questioning every decision that led to this moment.',
  cold: true,
};

const teaRecipes = {
  black:
    'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
  loose:
    'Submerge dead foliage in boiling water for 3 to 5 minutes or until you feel something.',
  green:
    'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  herbal:
    'Aggressively boil the flavor out of this plant for 5 minutes straight.',
};

// [heading, [button label, drink name, recipe type]]
/** @type {[string, [string, string, keyof teaRecipes][]][]} */
const teas = [
  [
    'Black · caffeinated',
    [
      ['Chinese Loose', 'Chinese Loose Black Tea', 'loose'],
      ['Earl Gray', 'Earl Gray Black Tea', 'black'],
      ['English Breakfast', 'English Breakfast Tea', 'black'],
      ['Chai', 'Chai Black Tea', 'black'],
      ['Constant Comment', 'Constant Comment Black Tea', 'loose'],
      ['Ginger Peach', 'Ginger Peach Black Tea', 'black'],
      ['Old World Spice', 'Old World Spice Black Tea', 'black'],
      ['Orange Spice', 'Orange Spice Black Tea', 'black'],
    ],
  ],
  [
    'Green · caffeinated',
    [
      ['Classic Green', 'Green Tea', 'green'],
      ['Organic Green', 'Organic Green Tea', 'green'],
      ['Moroccan Mint', 'Moroccan Mint Green Tea', 'green'],
      ['Acai Berry', 'Acai Berry Green Tea', 'green'],
      ['Honey Lemon Ginseng', 'Honey Lemon Ginseng Green Tea', 'green'],
      ['Lemon Ginger', 'Lemon Ginger Green Tea', 'green'],
      ['Mango', 'Mango Green Tea', 'green'],
      ['Orange Spice', 'Orange Spice Green Tea', 'green'],
      ['Peach', 'Peach Green Tea', 'green'],
      ['Pomegranate', 'Pomegranate Green Tea', 'green'],
    ],
  ],
  [
    'Herbal & decaf · no caffeine',
    [
      ['Honey Vanilla Chamomile', 'Honey Vanilla Chamomile Tea', 'herbal'],
      ['Sleepytime Vanilla', 'Sleepytime Vanilla Tea', 'herbal'],
      ['Tension Tamer', 'Tension Tamer Tea', 'herbal'],
      ['Peach Mango', 'Lipton Peach Mango Herbal Tea', 'herbal'],
      ['Peach', 'Peach Herbal Tea', 'herbal'],
      ['Lemon Ginger', 'Lemon Ginger Herbal Tea', 'herbal'],
      ['Orange Ginger Mint', 'Orange Ginger Mint Herbal Tea', 'herbal'],
      ['Bengal Spice', 'Bengal Spice Tea', 'herbal'],
      ['Mugwort', 'Mugwort Tea', 'herbal'],
      ['Mushroom Delight', 'Mushroom Delight Tea', 'herbal'],
      ['Reishi Eleuthero', 'Reishi Eleuthero Tea', 'herbal'],
      ['Decaf Earl Gray', 'Decaf Earl Gray Tea', 'black'],
    ],
  ],
];

/** @param {string} next */
const caffeine = (next) => ({
  question: 'How severely do you need your nervous system stimulated?',
  options: [
    {label: 'Caffeinate me! 🫨', chip: 'Caffeinated', next},
    {label: 'Half-Caf (Trust Issues) 🤨', mod: 'Half-Caf', next},
    {label: 'Decaf (Why are we even here?) 😒', mod: 'Decaf', next},
  ],
});

/** @param {string} next */
const blend = (next) => ({
  question: 'Do you want to blend this into a noisy Frappé equivalent?',
  options: [
    {label: 'No, just over ice 🧊', chip: 'Not blended', next},
    {label: 'Yes, blend it 🌪️', mod: 'Blended', next},
  ],
});

const milks = ['Whole Milk', 'Oat Milk'].map((mod) => ({
  label: mod,
  mod,
  next: 'extras',
}));

/** @type {Record<string, any>} */
export const menu = {
  start: {
    question: 'Select the liquid that keeps you tethered to this mortal plane:',
    options: [
      {label: 'Bean Soup (Espresso) ☕', next: 'espresso_temp'},
      {label: 'Leaf Soup (Tea) 🍵', next: 'tea_kind'},
      {label: 'Other Coping Mechanisms 🧊', next: 'other'},
      {label: 'Surprise Me! 🎲', surprise: true},
      // Unlocked by tapping the title 7 times.
      {secret: true, drink: intrusiveThought},
    ],
  },

  // --- Espresso ---
  espresso_temp: {
    question: 'What climate are we simulating today?',
    options: [
      {label: 'Hot 🔥', mod: 'Hot', next: 'espresso_hot'},
      {label: 'Iced 🧊', mod: 'Iced', next: 'espresso_iced'},
    ],
  },
  espresso_hot: {
    question: 'How do you want your hot liquid anxiety distributed?',
    options: [
      {label: 'Smooth & Milky (Latte) 🍼', drink: latte, next: 'caffeine_milk'},
      {
        label: 'A little milk (Cortado) 🎩',
        drink: cortado,
        next: 'caffeine_milk',
      },
      {
        label: 'Strong & Black (Americano) 😨',
        drink: americano,
        next: 'caffeine_maybe_milk',
      },
      {
        label: 'Straight Shot (Espresso) 💀',
        drink: espresso,
        next: 'caffeine_extras',
      },
    ],
  },
  espresso_iced: {
    question: 'How do you want your chilled anxiety distributed?',
    options: [
      {label: 'Creamy (Iced Latte) 🐄', drink: latte, next: 'blend_milk'},
      {
        label: 'A little milk (Iced Cortado) 🎩',
        drink: cortado,
        next: 'blend_milk',
      },
      {
        label: 'Black & over ice (Americano) 😨',
        drink: americano,
        next: 'blend_maybe_milk',
      },
      {
        label: 'Straight over ice (Psychopath) 🧊',
        drink: espresso,
        next: 'blend_extras',
      },
      {
        label: 'Espresso Tonic (Hipster nonsense) 🩲',
        drink: espressoTonic,
        next: 'caffeine_extras',
      },
    ],
  },
  blend_milk: blend('caffeine_milk'),
  blend_maybe_milk: blend('caffeine_maybe_milk'),
  blend_extras: blend('caffeine_extras'),
  caffeine_milk: caffeine('milk'),
  caffeine_maybe_milk: caffeine('maybe_milk'),
  caffeine_extras: caffeine('extras'),

  // --- Tea ---
  tea_kind: {
    question: 'What kind of leaf situation?',
    options: [
      {label: 'Tea 🫖', next: 'tea_temp'},
      {label: 'Matcha Latte 🍵', drink: matcha, next: 'latte_temp'},
      {label: 'Chai Latte 🌶️', drink: chai, next: 'latte_temp'},
      {
        label: 'Dirty Chai (with espresso) ☕',
        drink: dirtyChai,
        next: 'latte_temp',
      },
    ],
  },
  latte_temp: {
    question: 'Select your thermal preference:',
    options: [
      {label: 'Hot 🔥', mod: 'Hot', next: 'milk'},
      {label: 'Iced 🧊', mod: 'Iced', next: 'blend_milk_only'},
    ],
  },
  blend_milk_only: blend('milk'),
  tea_temp: {
    question: 'Select your thermal preference:',
    options: [
      {label: 'Hot 🔥', mod: 'Hot', next: 'tea_list'},
      {label: 'Iced 🧊', mod: 'Iced', next: 'tea_list'},
    ],
  },
  tea_list: {
    question: 'Pick your leaves:',
    grid: true,
    options: teas.flatMap(([group, list]) =>
      list.map(([label, name, type]) => ({
        label,
        group,
        drink: {name, recipe: teaRecipes[type], making: KETTLE},
        next: 'maybe_milk',
      })),
    ),
  },

  // --- Everything else ---
  other: {
    question: 'No caffeine, no problem. What are we drinking?',
    options: [
      {label: "Hot Choccy (I'm baby) 👶", drink: hotChocolate, next: 'milk'},
      {
        label: 'Vanilla Steamer (Kid friendly) 🍼',
        drink: steamer,
        next: 'milk',
      },
      {label: 'A Cold Glass of Milk 🥛', drink: glassOfMilk, next: 'milk'},
      {label: 'Sparkling Seltzer Water 🫧', drink: seltzer, next: 'sweeteners'},
      {label: 'Ice Water (POAC) 🚰', drink: iceWater},
    ],
  },

  // --- Shared final steps ---
  milk: {
    question: 'Select your preferred udder or nut extract:',
    options: milks,
  },
  maybe_milk: {
    question: 'Dilute it with some milk?',
    options: [
      {label: 'No, keep it clear', chip: 'No milk', next: 'extras'},
      ...milks,
    ],
  },
  extras: {
    question: 'Select your artificial joy and frivolous garnishes:',
    multi: true,
    options: [
      'Sugar',
      'Honey',
      'Stevia',
      'Vanilla Syrup',
      'Caramel Syrup',
      'Whipped Cream',
      'Cinnamon',
      'Cocoa Powder',
    ].map((mod) => ({label: mod, mod})),
  },
  sweeteners: {
    question: 'Any sugary coping mechanisms?',
    multi: true,
    options: ['Vanilla Syrup', 'Caramel Syrup', 'Sugar'].map((mod) => ({
      label: mod,
      mod,
    })),
  },
};
