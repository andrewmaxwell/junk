/** @param {string} next */
const getMilkOptions = (next) =>
  [
    'Whole Milk',
    'Oat Milk',
    // 'Almond Milk',
    // 'Soy Milk',
    // 'Coconut Milk',
  ].map((milk) => ({label: milk, modifierValue: milk, next}));

/** @param {string} next */
const getCaffeineOptions = (next) => ({
  question: 'How severely do you need your nervous system stimulated?',
  isModifier: true,
  options: [
    {label: 'Caffeinate me! 🫨', modifierValue: 'Regular', next},
    {label: 'Half-Caf (Trust Issues) 🤨', modifierValue: 'Half-Caf', next},
    {label: 'Decaf (Why are we even here?) 😒', modifierValue: 'Decaf', next},
  ],
});

/** @param {string} next */
const createBlendChoice = (next) => ({
  question: 'Do you want to blend this into a noisy Frappé equivalent?',
  isModifier: true,
  options: [
    {label: 'No, just over ice 🧊', next},
    {label: 'Yes, blend it 🌪️', modifierValue: 'Blended', next},
  ],
});

/**
 * @param {string} drinkName
 * @param {'black' | 'chinese_black' | 'green' | 'herbal'} type
 */
const createTeaEndpoint = (drinkName, type) => {
  const recipes = {
    black:
      'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
    chinese_black:
      'Submerge dead foliage in boiling water for 3 to 5 minutes or until you feel something.',
    green:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
    herbal:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  };
  return {
    isEndpoint: true,
    drinkName,
    recipe: recipes[type],
  };
};

export const menuData = {
  start: {
    question: 'Select the liquid that keeps you tethered to this mortal plane:',
    options: [
      {label: 'Bean Soup (Espresso) ☕', next: 'espresso_temp'},
      {label: 'Leaf Soup (Tea) 🍵', next: 'tea_category_choice'},
      {label: 'Other Coping Mechanisms 🧊', next: 'other_drinks'},
      {label: 'Surprise Me! 🎲', next: 'surprise_handler'},
    ],
  },

  other_drinks: {
    question: 'No caffeine, no problem. What are we drinking?',
    options: [
      {
        label: "Hot Choccy (I'm baby) 👶",
        next: 'milk_choice_cocoa',
        pendingEndpoint: 'endpoint_hot_chocolate',
      },
      {
        label: 'Vanilla Steamer (Kid friendly) 🍼',
        next: 'milk_choice_cocoa',
        pendingEndpoint: 'endpoint_steamer',
      },
      {
        label: 'A Cold Glass of Milk 🥛',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_glass_of_milk',
      },
      {
        label: 'Sparkling Seltzer Water 🫧',
        next: 'flavor_sweetener_choice_simple',
        pendingEndpoint: 'endpoint_seltzer',
      },
      {
        label: 'Ice Water (POAC) 🚰',
        inlineEndpoint: {
          isEndpoint: true,
          drinkName: 'Ice Water',
          recipe: 'For turning into pee.',
        },
      },
    ],
  },

  // --- TEA/MATCHA ROUTING ---
  tea_category_choice: {
    question: 'What kind?',
    options: [
      {label: 'Tea 🍵', next: 'tea_temp_choice'},
      {label: 'Matcha Latte 🍵', next: 'temp_choice_matcha'},
      {label: 'Chai Latte ☕', next: 'temp_choice_chai'},
      {label: 'Dirty Chai ☕', next: 'temp_choice_dirty_chai'},
    ],
  },

  tea_temp_choice: {
    question: 'Select your thermal preference:',
    isModifier: true,
    options: [
      {label: 'Hot 🔥', modifierValue: 'Hot', next: 'tea_caffeine'},
      {
        label: 'Iced 🧊',
        modifierValue: 'Iced',
        next: 'blend_choice_tea_caffeine',
      },
    ],
  },

  // --- TEMP CHOICES FOR NEW DRINKS ---
  temp_choice_dirty_chai: {
    question: 'Select your thermal preference:',
    options: [
      {
        label: 'Hot 🔥',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_hot_dirty_chai',
      },
      {
        label: 'Iced 🧊',
        next: 'blend_choice_milk_choice_short',
        pendingEndpoint: 'endpoint_iced_dirty_chai',
      },
    ],
  },
  temp_choice_matcha: {
    question: 'Select your thermal preference:',
    options: [
      {
        label: 'Hot 🔥',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_hot_matcha',
      },
      {
        label: 'Iced 🧊',
        next: 'blend_choice_milk_choice_short',
        pendingEndpoint: 'endpoint_iced_matcha',
      },
    ],
  },
  temp_choice_chai: {
    question: 'Select your thermal preference:',
    options: [
      {
        label: 'Hot 🔥',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_hot_chai',
      },
      {
        label: 'Iced 🧊',
        next: 'blend_choice_milk_choice_short',
        pendingEndpoint: 'endpoint_iced_chai',
      },
    ],
  },

  // --- ESPRESSO BRANCH ---
  espresso_temp: {
    question: 'What climate are we simulating today?',
    options: [
      {label: 'Hot 🔥', next: 'espresso_hot_style'},
      {label: 'Iced 🧊', next: 'espresso_iced_style'},
    ],
  },
  espresso_hot_style: {
    question: 'How do you want your hot liquid anxiety distributed?',
    options: [
      {
        label: 'Smooth & Milky (Latte) 🍼',
        next: 'caffeine_choice_latte',
        pendingEndpoint: 'endpoint_hot_latte',
      },
      {
        label: 'A little milk (Cortado) 🎩',
        next: 'caffeine_choice_cortado',
        pendingEndpoint: 'endpoint_cortado',
      },
      {
        label: 'Strong & Black (Americano) 😨',
        next: 'caffeine_choice_americano',
        pendingEndpoint: 'endpoint_hot_americano',
      },
      {
        label: 'Straight Shot (Espresso) 💀',
        next: 'caffeine_choice_espresso',
        pendingEndpoint: 'endpoint_espresso',
      },
    ],
  },
  espresso_iced_style: {
    question: 'How do you want your chilled anxiety distributed?',
    options: [
      {
        label: 'Creamy iced latte 🐄',
        next: 'blend_choice_caffeine_latte',
        pendingEndpoint: 'endpoint_iced_latte',
      },
      {
        label: 'A little milk (Iced Cortado) 🎩',
        next: 'blend_choice_caffeine_cortado',
        pendingEndpoint: 'endpoint_iced_cortado',
      },
      {
        label: 'Straight over ice (Psychopath) 🧊',
        next: 'blend_choice_caffeine_espresso',
        pendingEndpoint: 'endpoint_iced_espresso',
      },
      {
        label: 'Espresso Tonic (Hipster nonsense) 🩲',
        next: 'blend_choice_caffeine_espresso',
        pendingEndpoint: 'endpoint_espresso_tonic',
      },
    ],
  },

  // --- BLEND CHOICES ---
  blend_choice_caffeine_espresso: createBlendChoice('caffeine_choice_espresso'),
  blend_choice_caffeine_americano: createBlendChoice(
    'caffeine_choice_americano',
  ),
  blend_choice_caffeine_cortado: createBlendChoice('caffeine_choice_cortado'),
  blend_choice_caffeine_latte: createBlendChoice('caffeine_choice_latte'),
  blend_choice_tea_caffeine: createBlendChoice('tea_caffeine'),

  blend_choice_milk_choice_short: createBlendChoice('milk_choice_short'),

  // --- CAFFEINE ROUTING ---
  caffeine_choice_espresso: getCaffeineOptions('flavor_topping_choice'),
  caffeine_choice_americano: getCaffeineOptions('tea_milk_optional'),
  caffeine_choice_cortado: getCaffeineOptions('milk_choice_short'),
  caffeine_choice_latte: getCaffeineOptions('milk_choice_short'),

  // --- MODIFIERS CHAIN ---
  milk_choice_short: {
    question: 'Choose your preferred dilution liquid:',
    isModifier: true,
    options: getMilkOptions('flavor_topping_choice'),
  },

  // Special quick flavor screen for basic beverages (skips toppings)
  flavor_sweetener_choice_simple: {
    question: 'Any sugary coping mechanisms?',
    multiSelect: true,
    multiSelectNext: null,
    options: [
      {label: 'Vanilla Syrup', modifierValue: 'Vanilla Syrup', next: null},
      {label: 'Caramel Syrup', modifierValue: 'Caramel Syrup', next: null},
      {label: 'Sugar', modifierValue: 'Sugar', next: null},
    ],
  },

  flavor_topping_choice: {
    question: 'Select your artificial joy and frivolous garnishes:',
    isModifier: true,
    multiSelect: true,
    multiSelectNext: null,
    options: [
      {label: 'Sugar', modifierValue: 'Sugar', next: null},
      {label: 'Vanilla Syrup', modifierValue: 'Vanilla Syrup', next: null},
      {label: 'Caramel Syrup', modifierValue: 'Caramel Syrup', next: null},
      {label: 'Whipped Cream', modifierValue: 'Whipped Cream', next: null},
      {label: 'Cinnamon', modifierValue: 'Cinnamon', next: null},
      {label: 'Cocoa Powder', modifierValue: 'Cocoa Powder', next: null},
      {label: 'Honey', modifierValue: 'Honey', next: null},
      {label: 'Stevia', modifierValue: 'Stevia', next: null},
    ],
  },

  milk_choice_cocoa: {
    question: 'Select your preferred udder or nut extract:',
    isModifier: true,
    options: getMilkOptions('flavor_topping_choice'),
  },

  tea_milk_optional: {
    question: 'Dilute it with some milk?',
    isModifier: true,
    options: [
      {label: 'No, keep it clear', next: 'flavor_topping_choice'},
      ...getMilkOptions('flavor_topping_choice'),
    ],
  },

  // --- TEA BRANCH ---
  tea_caffeine: {
    question: 'Do you require artificial energy?',
    options: [
      {label: 'Yes, caffeinate me 🫨', next: 'tea_caf_type'},
      {label: 'No, keep it herbal/decaf 😒', next: 'tea_decaf_categories'},
    ],
  },
  tea_caf_type: {
    question: 'Black tea or Green tea?',
    options: [
      {label: 'Bold Black Teas ☕', next: 'tea_caf_black_categories'},
      {label: 'Bright Green Teas 🍵', next: 'tea_caf_green_categories'},
    ],
  },

  // Notice how Black teas point to 'tea_milk_optional', while Green/Herbal teas skip milk and go to 'flavor_topping_choice'!
  tea_caf_black_categories: {
    question: 'Choose your Black Tea profile:',
    options: [
      {label: 'Traditional & Classic ☕', next: 'tea_caf_black_traditional'},
      {label: 'Spiced & Vibrant 🌶️', next: 'tea_caf_black_spiced'},
    ],
  },
  tea_caf_black_traditional: {
    question: 'Pick your Traditional Black Tea:',
    options: [
      {
        label: 'Chinese Loose Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_chinese_black',
      },
      {
        label: 'Earl Gray Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_earl_gray_black',
      },
      {
        label: 'Traditional English Breakfast',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_english_breakfast',
      },
    ],
  },
  tea_caf_black_spiced: {
    question: 'Pick your Spiced Black Tea:',
    options: [
      {
        label: 'Chai Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_hot_chai',
      },
      {
        label: 'Constant Comment',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_constant_comment',
      },
      {
        label: 'Ginger Peach Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_ginger_peach_black',
      },
      {
        label: 'Old World Spice',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_old_world_spice',
      },
      {
        label: 'Orange Spice Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_orange_spice_black',
      },
    ],
  },

  tea_caf_green_categories: {
    question: 'Choose your Green Tea profile:',
    options: [
      {label: 'Traditional & Mint 🌱', next: 'tea_caf_green_traditional'},
      {label: 'Fruity & Citrus 🍑', next: 'tea_caf_green_fruity'},
    ],
  },
  tea_caf_green_traditional: {
    question: 'Pick your Traditional Green Tea:',
    options: [
      {
        label: 'Standard Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_green',
      },
      {
        label: 'Moroccan Mint Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_moroccan_mint',
      },
      {
        label: 'Organic Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_organic_green',
      },
    ],
  },
  tea_caf_green_fruity: {
    question: 'Pick your Fruity Green Tea:',
    options: [
      {
        label: 'Acai Berry Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_acai_berry_green',
      },
      {
        label: 'Honey Lemon Ginseng Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_honey_ginseng',
      },
      {
        label: 'Lemon Ginger Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_lemon_ginger_green',
      },
      {
        label: 'Mango Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_mango_green',
      },
      {
        label: 'Orange Spice Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_orange_green',
      },
      {
        label: 'Peach Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_peach_green',
      },
      {
        label: 'Pomegranate Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_pomegranate_green',
      },
    ],
  },

  tea_decaf_categories: {
    question: 'Choose your Herbal/Decaf profile:',
    options: [
      {label: 'Fruity & Bright 🍋', next: 'tea_decaf_fruity'},
      {label: 'Floral & Relaxing 🌼', next: 'tea_decaf_relaxing'},
      {label: 'Earthy, Spiced & Functional 🍄', next: 'tea_decaf_earthy'},
      {label: 'Decaf Traditional 🫖', next: 'tea_decaf_traditional'},
    ],
  },
  tea_decaf_fruity: {
    question: 'Pick your Fruity Herbal Tea:',
    options: [
      {
        label: 'Lipton Peach Mango Herbal',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_lipton_peach_mango',
      },
      {
        label: 'Orange Ginger Mint Herbal',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_orange_ginger_mint',
      },
      {
        label: 'Organic Lemon Ginger',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_lemon_ginger',
      },
      {
        label: 'Peach Herbal',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_peach',
      },
    ],
  },
  tea_decaf_relaxing: {
    question: 'Pick your Relaxing Herbal Tea:',
    options: [
      {
        label: 'Honey Vanilla Chamomile',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_honey_chamomile',
      },
      {
        label: 'Sleepytime Vanilla',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_sleepytime_vanilla',
      },
      {
        label: 'Tension Tamer',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_tension_tamer',
      },
    ],
  },
  tea_decaf_earthy: {
    question: 'Pick your Earthy/Spiced Herbal Tea:',
    options: [
      {
        label: 'Bengal Spice',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_bengal_spice',
      },
      {
        label: 'Mugwort',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_mugwort',
      },
      {
        label: 'Mushroom Delight (Caffeine Free)',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_mushroom_delight',
      },
      {
        label: 'Reishi Eleuthero',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_reishi',
      },
    ],
  },
  tea_decaf_traditional: {
    question: 'Pick your Traditional Decaf Tea:',
    options: [
      {
        label: 'Earl Gray Decaf',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_decaf_earl_gray',
      },
    ],
  },

  // --- BASE ENDPOINTS ---
  endpoint_espresso: {
    isEndpoint: true,
    drinkName: 'Straight Espresso',
    recipe: 'Two shots of pure, undiluted chaos. Good luck.',
  },
  endpoint_hot_americano: {
    isEndpoint: true,
    drinkName: 'Hot Americano',
    recipe: 'Watered-down anxiety for people who fear flavor.',
  },
  endpoint_cortado: {
    isEndpoint: true,
    drinkName: 'Cortado',
    recipe:
      'For when you want to look sophisticated but actually just want a tiny latte.',
  },
  endpoint_hot_latte: {
    isEndpoint: true,
    drinkName: 'Hot Latte',
    recipe:
      'Mashed up roasted beans disguised by an ocean of warm mammal or plant extract.',
  },
  endpoint_iced_americano: {
    isEndpoint: true,
    drinkName: 'Iced Americano',
    recipe: 'Cold, watery, and emotionally distant. Just like my ex.',
  },
  endpoint_iced_espresso: {
    isEndpoint: true,
    drinkName: 'Straight Iced Espresso',
    recipe: 'A violent shock to your system. Cold and completely unforgiving.',
  },
  endpoint_hot_dirty_chai: {
    isEndpoint: true,
    drinkName: 'Hot Dirty Chai',
    recipe:
      'Sweet, spicy goodness deliberately ruined by aggressive bean juice.',
  },
  endpoint_iced_dirty_chai: {
    isEndpoint: true,
    drinkName: 'Iced Dirty Chai',
    recipe: 'A confused icy beverage going through a severe identity crisis.',
  },
  endpoint_steamer: {
    isEndpoint: true,
    drinkName: 'Steamer',
    recipe: 'Literally just hot milk. Are you a Victorian child with a cold?',
  },
  endpoint_iced_latte: {
    isEndpoint: true,
    drinkName: 'Iced Latte',
    recipe: 'The basic lifeline. 80% ice, 20% personality.',
  },
  endpoint_frappe: {
    isEndpoint: true,
    drinkName: 'Espresso Frappé',
    recipe:
      'A noisy blender apocalypse serving liquid diabetes with a hint of coffee.',
  },

  // Matcha & Chai
  endpoint_hot_matcha: {
    isEndpoint: true,
    drinkName: 'Hot Matcha Latte',
    recipe: 'Fancy green swamp water, gently heated.',
  },
  endpoint_iced_matcha: {
    isEndpoint: true,
    drinkName: 'Iced Matcha Latte',
    recipe: 'Cold, mathematically whisked green sludge.',
  },
  endpoint_hot_chai: {
    isEndpoint: true,
    drinkName: 'Hot Chai Latte',
    recipe: "Spicy milk that thinks it's better than you.",
  },
  endpoint_iced_chai: {
    isEndpoint: true,
    drinkName: 'Iced Chai Latte',
    recipe: 'Cold spicy milk. Basically a liquid candle.',
  },

  // Hot Chocolate
  endpoint_hot_chocolate: {
    isEndpoint: true,
    drinkName: 'Hot Chocolate',
    recipe: 'Melted chocolate masquerading as a morning routine.',
  },

  // Tea Endpoints
  endpoint_tea_chinese_black: createTeaEndpoint(
    'Chinese Loose Black Tea',
    'chinese_black',
  ),
  endpoint_tea_english_breakfast: createTeaEndpoint(
    'English Breakfast Tea',
    'black',
  ),
  endpoint_tea_constant_comment: createTeaEndpoint(
    'Constant Comment Black Tea',
    'chinese_black',
  ),
  endpoint_tea_old_world_spice: createTeaEndpoint(
    'Old World Spice Black Tea',
    'black',
  ),

  endpoint_tea_green: createTeaEndpoint('Green Tea', 'green'),
  endpoint_tea_orange_green: createTeaEndpoint(
    'Orange Spice Green Tea',
    'green',
  ),
  endpoint_tea_honey_ginseng: createTeaEndpoint(
    'Honey Lemon Ginseng Green Tea',
    'green',
  ),

  endpoint_tea_lemon_ginger: createTeaEndpoint(
    'Lemon Ginger Herbal Tea',
    'herbal',
  ),
  endpoint_tea_bengal_spice: createTeaEndpoint(
    'Bengal Spice Herbal Tea',
    'herbal',
  ),
  endpoint_tea_honey_chamomile: createTeaEndpoint(
    'Honey Vanilla Chamomile',
    'herbal',
  ),
  endpoint_tea_sleepytime_vanilla: createTeaEndpoint(
    'Sleepytime Vanilla Herbal Tea',
    'herbal',
  ),
  endpoint_tea_peach: createTeaEndpoint('Peach Herbal Tea', 'herbal'),
  endpoint_tea_tension_tamer: createTeaEndpoint(
    'Tension Tamer Herbal Tea',
    'herbal',
  ),
  endpoint_tea_mugwort: createTeaEndpoint('Mugwort Tea', 'herbal'),
  endpoint_tea_reishi: createTeaEndpoint('Reishi Eleuthero Tea', 'herbal'),
  endpoint_tea_decaf_earl_gray: createTeaEndpoint(
    'Decaf Earl Gray Tea',
    'black',
  ),

  // NEW TEAS
  endpoint_tea_earl_gray_black: createTeaEndpoint(
    'Earl Gray Black Tea',
    'black',
  ),
  endpoint_tea_ginger_peach_black: createTeaEndpoint(
    'Ginger Peach Black Tea',
    'black',
  ),
  endpoint_tea_orange_spice_black: createTeaEndpoint(
    'Orange Spice Black Tea',
    'black',
  ),
  endpoint_tea_acai_berry_green: createTeaEndpoint(
    'Acai Berry Green Tea',
    'green',
  ),
  endpoint_tea_lemon_ginger_green: createTeaEndpoint(
    'Lemon Ginger Green Tea',
    'green',
  ),
  endpoint_tea_mango_green: createTeaEndpoint('Mango Green Tea', 'green'),
  endpoint_tea_moroccan_mint: createTeaEndpoint(
    'Moroccan Mint Green Tea',
    'green',
  ),
  endpoint_tea_organic_green: createTeaEndpoint('Organic Green Tea', 'green'),
  endpoint_tea_peach_green: createTeaEndpoint('Peach Green Tea', 'green'),
  endpoint_tea_pomegranate_green: createTeaEndpoint(
    'Pomegranate Green Tea',
    'green',
  ),
  endpoint_tea_lipton_peach_mango: createTeaEndpoint(
    'Lipton Peach Mango Herbal Tea',
    'herbal',
  ),
  endpoint_tea_mushroom_delight: createTeaEndpoint(
    'Mushroom Delight Tea',
    'herbal',
  ),
  endpoint_tea_orange_ginger_mint: createTeaEndpoint(
    'Orange Ginger Mint Herbal Tea',
    'herbal',
  ),

  // Custom Ice Requests
  endpoint_iced_cortado: {
    isEndpoint: true,
    drinkName: 'Iced Cortado',
    recipe: 'Double shot with equal parts cold milk over ice.',
  },
  endpoint_espresso_tonic: {
    isEndpoint: true,
    drinkName: 'Espresso Tonic',
    recipe: 'Double shot poured over iced seltzer water.',
  },

  // Simple Beverages
  endpoint_glass_of_milk: {
    isEndpoint: true,
    drinkName: 'Glass of Milk',
    recipe: 'Cold milk poured directly into a glass. Classic.',
  },
  endpoint_seltzer: {
    isEndpoint: true,
    drinkName: 'Seltzer Water',
    recipe: 'Bubbly seltzer water over ice.',
  },

  // Secret Menu
  endpoint_secret_menu: {
    isEndpoint: true,
    drinkName: 'The Intrusive Thought',
    recipe:
      'A feral mixture of fresh espresso and raw matcha powder, violently dry-shaken until it forms a gritty paste, then topped with carbonated seltzer. Tastes like a Tuesday afternoon panic attack.',
  },
};
