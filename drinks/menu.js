export const menuData = {
  start: {
    question: 'Select the liquid that keeps you tethered to this mortal plane:',
    options: [
      {label: 'Coffee (Anti-Sleep Juice) ☕', next: 'espresso_temp'},
      {label: 'Leaf Soup (Tea & Matcha) 🍵', next: 'tea_category_choice'},
      {label: 'Misc Coping Mechanisms 🧊', next: 'other_drinks'},
      {label: 'Make It Hurt (Surprise Me) 🎲', next: 'surprise_handler'},
    ],
  },

  other_drinks: {
    question: 'No caffeine, no problem. What are we drinking?',
    options: [
      {
        label: "Hot Choccy (I'm baby)",
        next: 'milk_choice_cocoa',
        pendingEndpoint: 'endpoint_hot_chocolate',
      },
      {
        label: 'Vanilla Steamer (Kid friendly)',
        next: 'milk_choice_cocoa',
        pendingEndpoint: 'endpoint_steamer',
      },
      {
        label: 'A Cold Glass of Milk',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_glass_of_milk',
      },
      {
        label: 'Sparkling Seltzer Water',
        next: 'flavor_sweetener_choice_simple',
        pendingEndpoint: 'endpoint_seltzer',
      },
      {
        label: 'Ice Water (POAC)',
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
    question: 'Hot leaf juice. Pick your plant:',
    options: [
      {label: 'Matcha Latte', next: 'temp_choice_matcha'},
      {label: 'Chai Latte', next: 'temp_choice_chai'},
      {label: 'Dirty Chai', next: 'temp_choice_dirty_chai'},
      {label: 'Traditional Teas', next: 'tea_temp_choice'},
    ],
  },

  tea_temp_choice: {
    question: 'Select your thermal preference:',
    isModifier: true,
    options: [
      {label: 'Hot & Cozy', modifierValue: 'Hot', next: 'tea_caffeine'},
      {label: 'Crisp & Iced', modifierValue: 'Iced', next: 'tea_caffeine'},
    ],
  },

  // --- TEMP CHOICES FOR NEW DRINKS ---
  temp_choice_dirty_chai: {
    question: 'Select your thermal preference:',
    options: [
      {
        label: 'Hot & Cozy',
        next: 'caffeine_choice_dirty_chai',
        pendingEndpoint: 'endpoint_hot_dirty_chai',
      },
      {
        label: 'Crisp & Iced',
        next: 'caffeine_choice_dirty_chai',
        pendingEndpoint: 'endpoint_iced_dirty_chai',
      },
    ],
  },
  temp_choice_matcha: {
    question: 'Select your thermal preference:',
    options: [
      {
        label: 'Hot & Cozy',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_hot_matcha',
      },
      {
        label: 'Crisp & Iced',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_iced_matcha',
      },
    ],
  },
  temp_choice_chai: {
    question: 'Select your thermal preference:',
    options: [
      {
        label: 'Hot & Cozy',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_hot_chai',
      },
      {
        label: 'Crisp & Iced',
        next: 'milk_choice_short',
        pendingEndpoint: 'endpoint_iced_chai',
      },
    ],
  },

  // --- ESPRESSO BRANCH ---
  espresso_temp: {
    question: 'What climate are we simulating today?',
    options: [
      {label: 'Hot & Searing 🔥', next: 'espresso_hot_style'},
      {label: 'Cold & Emotionally Distant 🧊', next: 'espresso_iced_style'},
      {
        label: 'Aggressively Blended 🌪️',
        next: 'caffeine_choice_frappe',
        pendingEndpoint: 'endpoint_frappe',
      },
    ],
  },
  espresso_hot_style: {
    question: 'How do you want your hot liquid anxiety distributed?',
    options: [
      {
        label: 'Straight Shot (Pure Pain)',
        next: 'caffeine_choice_espresso',
        pendingEndpoint: 'endpoint_espresso',
      },
      {
        label: 'Strong & Black (Existential Dread)',
        next: 'caffeine_choice_americano',
        pendingEndpoint: 'endpoint_hot_americano',
      },
      {
        label: 'A little milk (Cortado)',
        next: 'caffeine_choice_cortado',
        pendingEndpoint: 'endpoint_cortado',
      },
      {
        label: 'Smooth & Milky (Adult Baby)',
        next: 'caffeine_choice_latte',
        pendingEndpoint: 'endpoint_hot_latte',
      },
    ],
  },
  espresso_iced_style: {
    question: 'How do you want your chilled anxiety distributed?',
    options: [
      {
        label: 'Straight over ice (Psychopath)',
        next: 'caffeine_choice_espresso',
        pendingEndpoint: 'endpoint_iced_espresso',
      },
      {
        label: 'Black over ice (Americano)',
        next: 'caffeine_choice_americano',
        pendingEndpoint: 'endpoint_iced_americano',
      },
      {
        label: 'A little milk (Iced Cortado)',
        next: 'caffeine_choice_cortado',
        pendingEndpoint: 'endpoint_iced_cortado',
      },
      {
        label: 'Creamy iced latte',
        next: 'caffeine_choice_latte',
        pendingEndpoint: 'endpoint_iced_latte',
      },
      {
        label: 'Shaken with a splash of milk',
        next: 'caffeine_choice_latte',
        pendingEndpoint: 'endpoint_shaken_espresso',
      },
      {
        label: 'Espresso Tonic (Hipster nonsense)',
        next: 'caffeine_choice_espresso',
        pendingEndpoint: 'endpoint_espresso_tonic',
      },
    ],
  },

  // --- CAFFEINE ROUTING ---
  caffeine_choice_espresso: {
    question: 'How violently should we attack your nervous system?',
    isModifier: true,
    options: [
      {
        label: 'Standard Issue Jitters',
        modifierValue: 'Regular',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Half-Caf (Commitment Issues)',
        modifierValue: 'Half-Caf',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Decaf (A waste of time)',
        modifierValue: 'Decaf',
        next: 'flavor_sweetener_choice',
      },
    ],
  },
  caffeine_choice_dirty_chai: {
    question: 'How dirty are we talking?',
    isModifier: true,
    options: [
      {
        label: '1 Shot Regular',
        modifierValue: '1 Shot Regular',
        next: 'milk_choice_short',
      },
      {
        label: '2 Shots Regular',
        modifierValue: '2 Shots Regular',
        next: 'milk_choice_short',
      },
      {
        label: '1 Shot Decaf Espresso (Chai still has caffeine!)',
        modifierValue: '1 Shot Decaf',
        next: 'milk_choice_short',
      },
    ],
  },
  caffeine_choice_americano: {
    question: 'How severely do you need your nervous system stimulated?',
    isModifier: true,
    options: [
      {
        label: 'Regular (Standard Issue)',
        modifierValue: 'Regular',
        next: 'tea_milk_optional',
      },
      {
        label: 'Half-Caf (Trust Issues)',
        modifierValue: 'Half-Caf',
        next: 'tea_milk_optional',
      },
      {
        label: 'Decaf (Why are we even here?)',
        modifierValue: 'Decaf',
        next: 'tea_milk_optional',
      },
    ],
  },
  caffeine_choice_cortado: {
    question: 'How severely do you need your nervous system stimulated?',
    isModifier: true,
    options: [
      {
        label: 'Regular (Standard Issue)',
        modifierValue: 'Regular',
        next: 'milk_choice_short',
      },
      {
        label: 'Half-Caf (Trust Issues)',
        modifierValue: 'Half-Caf',
        next: 'milk_choice_short',
      },
      {
        label: 'Decaf (Why are we even here?)',
        modifierValue: 'Decaf',
        next: 'milk_choice_short',
      },
    ],
  },
  caffeine_choice_latte: {
    question: 'How severely do you need your nervous system stimulated?',
    isModifier: true,
    options: [
      {
        label: 'Regular (Standard Issue)',
        modifierValue: 'Regular',
        next: 'milk_choice_short',
      },
      {
        label: 'Half-Caf (Trust Issues)',
        modifierValue: 'Half-Caf',
        next: 'milk_choice_short',
      },
      {
        label: 'Decaf (Why are we even here?)',
        modifierValue: 'Decaf',
        next: 'milk_choice_short',
      },
    ],
  },
  caffeine_choice_frappe: {
    question: 'How severely do you need your nervous system stimulated?',
    isModifier: true,
    options: [
      {
        label: 'Regular (Standard Issue)',
        modifierValue: 'Regular',
        next: 'milk_choice_short',
      },
      {
        label: 'Half-Caf (Trust Issues)',
        modifierValue: 'Half-Caf',
        next: 'milk_choice_short',
      },
      {
        label: 'Decaf (Why are we even here?)',
        modifierValue: 'Decaf',
        next: 'milk_choice_short',
      },
    ],
  },

  // --- MODIFIERS CHAIN ---
  milk_choice_short: {
    question: 'Choose your preferred dilution liquid:',
    isModifier: true,
    options: [
      {
        label: 'Whole Milk',
        modifierValue: 'Whole Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Oat Milk',
        modifierValue: 'Oat Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Almond Milk',
        modifierValue: 'Almond Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Soy Milk',
        modifierValue: 'Soy Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Coconut Milk',
        modifierValue: 'Coconut Milk',
        next: 'flavor_sweetener_choice',
      },
    ],
  },

  // Special quick flavor screen for basic beverages (skips toppings)
  flavor_sweetener_choice_simple: {
    question: 'Any sugary coping mechanisms?',
    multiSelect: true,
    multiSelectNext: null,
    options: [
      {label: 'Vanilla', modifierValue: 'Vanilla', next: null},
      {label: 'Caramel', modifierValue: 'Caramel', next: null},
      {label: 'White Sugar', modifierValue: 'White Sugar', next: null},
    ],
  },

  flavor_sweetener_choice: {
    question: 'Select your artificial joy (Syrups/Sweeteners):',
    isModifier: true,
    multiSelect: true,
    multiSelectNext: 'topping_choice',
    options: [
      {label: 'Vanilla', modifierValue: 'Vanilla', next: null},
      {label: 'Caramel', modifierValue: 'Caramel', next: null},
      {label: 'Mocha', modifierValue: 'Mocha', next: null},

      {label: 'Brown Sugar', modifierValue: 'Brown Sugar', next: null},
      {label: 'White Sugar', modifierValue: 'White Sugar', next: null},
      {label: 'Stevia', modifierValue: 'Stevia', next: null},
      {label: 'Honey', modifierValue: 'Honey', next: null},
    ],
  },

  milk_choice_cocoa: {
    question: 'Select your preferred udder or nut extract:',
    isModifier: true,
    options: [
      {
        label: 'Whole Milk',
        modifierValue: 'Whole Milk',
        next: 'topping_choice',
      },
      {label: 'Oat Milk', modifierValue: 'Oat Milk', next: 'topping_choice'},
      {
        label: 'Almond Milk',
        modifierValue: 'Almond Milk',
        next: 'topping_choice',
      },
      {label: 'Soy Milk', modifierValue: 'Soy Milk', next: 'topping_choice'},
    ],
  },

  tea_milk_optional: {
    question: 'Dilute it with some milk?',
    isModifier: true,
    options: [
      {label: 'No, keep it clear', next: 'flavor_sweetener_choice'},
      {
        label: 'Whole Milk',
        modifierValue: 'Whole Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Oat Milk',
        modifierValue: 'Oat Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Almond Milk',
        modifierValue: 'Almond Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Soy Milk',
        modifierValue: 'Soy Milk',
        next: 'flavor_sweetener_choice',
      },
      {
        label: 'Coconut Milk',
        modifierValue: 'Coconut Milk',
        next: 'flavor_sweetener_choice',
      },
    ],
  },

  topping_choice: {
    question: 'Any frivolous garnishes to distract from reality?',
    isModifier: true,
    multiSelect: true,
    options: [
      {label: 'Whipped Cream', modifierValue: 'Whipped Cream', next: null},
      {label: 'Cinnamon', modifierValue: 'Cinnamon', next: null},
      {label: 'Cocoa Powder', modifierValue: 'Cocoa Powder', next: null},
      {label: 'Caramel Drizzle', modifierValue: 'Caramel Drizzle', next: null},
    ],
  },

  // --- TEA BRANCH ---
  tea_caffeine: {
    question: 'Do you require artificial energy?',
    options: [
      {label: 'Yes, caffeinate me', next: 'tea_caf_type'},
      {label: 'No, keep it herbal/decaf', next: 'tea_decaf_list'},
    ],
  },
  tea_caf_type: {
    question: 'Black tea or Green tea?',
    options: [
      {label: 'Bold Black Teas', next: 'tea_caf_black_list'},
      {label: 'Bright Green Teas', next: 'tea_caf_green_list'},
    ],
  },

  // Notice how Black teas point to 'tea_milk_optional', while Green/Herbal teas skip milk and go to 'flavor_sweetener_choice'!
  tea_caf_black_list: {
    question: 'Pick your Black Tea:',
    options: [
      {
        label: 'Chai Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_hot_chai',
      },
      {
        label: 'Chinese Loose Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_chinese_black',
      },
      {
        label: 'Constant Comment',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_constant_comment',
      },
      {
        label: 'Earl Gray Black',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_earl_gray_black',
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
      {
        label: 'Traditional English Breakfast',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_english_breakfast',
      },
    ],
  },
  tea_caf_green_list: {
    question: 'Pick your Green Tea:',
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
        label: 'Moroccan Mint Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_moroccan_mint',
      },
      {
        label: 'Orange Spice Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_orange_green',
      },
      {
        label: 'Organic Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_organic_green',
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
      {
        label: 'Standard Green',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_green',
      },
    ],
  },
  tea_decaf_list: {
    question: 'Pick your Herbal/Decaf Tea:',
    options: [
      {
        label: 'Bengal Spice',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_bengal_spice',
      },
      {
        label: 'Earl Gray Decaf',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_decaf_earl_gray',
      },
      {
        label: 'Honey Vanilla Chamomile',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_honey_chamomile',
      },
      {
        label: 'Lipton Peach Mango Herbal',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_lipton_peach_mango',
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
      {
        label: 'Reishi Eleuthero',
        next: 'tea_milk_optional',
        pendingEndpoint: 'endpoint_tea_reishi',
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
      'Mashed up roasted beans disguised by an ocean of warm cow or nut extract.',
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
  endpoint_shaken_espresso: {
    isEndpoint: true,
    drinkName: 'Iced Shaken Espresso',
    recipe:
      'Shaken so violently that the espresso questions its life choices. Splashed with milk to hide the bruising.',
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
  endpoint_tea_chinese_black: {
    isEndpoint: true,
    drinkName: 'Chinese Loose Black Tea',
    recipe:
      'Submerge dead foliage in boiling water for 3 to 5 minutes or until you feel something.',
  },
  endpoint_tea_english_breakfast: {
    isEndpoint: true,
    drinkName: 'English Breakfast Tea',
    recipe:
      'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
  },
  endpoint_tea_constant_comment: {
    isEndpoint: true,
    drinkName: 'Constant Comment Black Tea',
    recipe:
      'Submerge dead foliage in boiling water for 3 to 5 minutes or until you feel something.',
  },
  endpoint_tea_old_world_spice: {
    isEndpoint: true,
    drinkName: 'Old World Spice Black Tea',
    recipe:
      'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
  },

  endpoint_tea_green: {
    isEndpoint: true,
    drinkName: 'Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_orange_green: {
    isEndpoint: true,
    drinkName: 'Orange Spice Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_honey_ginseng: {
    isEndpoint: true,
    drinkName: 'Honey Lemon Ginseng Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },

  endpoint_tea_lemon_ginger: {
    isEndpoint: true,
    drinkName: 'Lemon Ginger Herbal Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_bengal_spice: {
    isEndpoint: true,
    drinkName: 'Bengal Spice Herbal Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_honey_chamomile: {
    isEndpoint: true,
    drinkName: 'Honey Vanilla Chamomile',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_sleepytime_vanilla: {
    isEndpoint: true,
    drinkName: 'Sleepytime Vanilla Herbal Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_peach: {
    isEndpoint: true,
    drinkName: 'Peach Herbal Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_tension_tamer: {
    isEndpoint: true,
    drinkName: 'Tension Tamer Herbal Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_mugwort: {
    isEndpoint: true,
    drinkName: 'Mugwort Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_reishi: {
    isEndpoint: true,
    drinkName: 'Reishi Eleuthero Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_decaf_earl_gray: {
    isEndpoint: true,
    drinkName: 'Decaf Earl Gray',
    recipe:
      'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
  },

  // NEW TEAS
  endpoint_tea_earl_gray_black: {
    isEndpoint: true,
    drinkName: 'Earl Gray Black Tea',
    recipe:
      'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
  },
  endpoint_tea_ginger_peach_black: {
    isEndpoint: true,
    drinkName: 'Ginger Peach Black Tea',
    recipe:
      'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
  },
  endpoint_tea_orange_spice_black: {
    isEndpoint: true,
    drinkName: 'Orange Spice Black Tea',
    recipe:
      'Leave this in hot water for exactly 4 minutes. Do not make eye contact with it.',
  },
  endpoint_tea_acai_berry_green: {
    isEndpoint: true,
    drinkName: 'Acai Berry Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_lemon_ginger_green: {
    isEndpoint: true,
    drinkName: 'Lemon Ginger Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_mango_green: {
    isEndpoint: true,
    drinkName: 'Mango Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_moroccan_mint: {
    isEndpoint: true,
    drinkName: 'Moroccan Mint Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_organic_green: {
    isEndpoint: true,
    drinkName: 'Organic Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_peach_green: {
    isEndpoint: true,
    drinkName: 'Peach Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_pomegranate_green: {
    isEndpoint: true,
    drinkName: 'Pomegranate Green Tea',
    recipe:
      'Drown these specific leaves in screaming hot water for exactly 180 seconds.',
  },
  endpoint_tea_lipton_peach_mango: {
    isEndpoint: true,
    drinkName: 'Lipton Peach Mango Herbal Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_mushroom_delight: {
    isEndpoint: true,
    drinkName: 'Mushroom Delight Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },
  endpoint_tea_orange_ginger_mint: {
    isEndpoint: true,
    drinkName: 'Orange Ginger Mint Herbal Tea',
    recipe:
      'Aggressively boil the flavor out of this plant for 5 minutes straight.',
  },

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
