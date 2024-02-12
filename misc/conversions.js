const convert = (conversions, from, to) => {
  const queue = [{unit: from, value: 1}];
  for (const {unit, value} of queue) {
    if (unit === to) return value;
    for (const [v, a, b] of conversions) {
      if (a === unit) queue.push({unit: b, value: value / v});
      if (b === unit) queue.push({unit: a, value: value * v});
    }
  }
};

//////////// TESTS

const realConversions = [
  [12, 'inch', 'foot'],
  [3, 'foot', 'yard'],
  [1760, 'yard', 'mile'],
  [5280, 'foot', 'mile'],
  [2.54, 'centimeter', 'inch'],
  [100, 'centimeter', 'meter'],
  [1000, 'meter', 'kilometer'],
];

console.log(convert(realConversions, 'meter', 'meter'), 1);
console.log(convert(realConversions, 'yard', 'inch'), 36);
console.log(convert(realConversions, 'foot', 'centimeter'), 30.48);
console.log(convert(realConversions, 'mile', 'kilometer'), 1.609344);

const madeUpConversions = [
  [51, 'zlub', 'bort'], // 51 zlubs in a bort
  [1 / 459, 'terg', 'zlub'],
  [17, 'bort', 'frop'],
  [9, 'bort', 'terg'],
  [11, 'terg', 'melp'],
  [17, 'melp', 'porx'],
  [461, 'terg', 'gomp'],
];

console.log(convert(madeUpConversions, 'bort', 'zlub'), 51);
console.log(convert(madeUpConversions, 'frop', 'zlub'), 867);
console.log(convert(madeUpConversions, 'frop', 'porx'), 1 / 99);
console.log(convert(madeUpConversions, 'porx', 'frop'), 99);
console.log(convert(madeUpConversions, 'gomp', 'zlub'), 461 * 459);

////////////////

const shuffle = (arr) => {
  for (let counter = arr.length; counter; ) {
    const index = Math.floor(Math.random() * counter--);
    [arr[counter], arr[index]] = [arr[index], arr[counter]];
  }
  return arr;
};

const randEl = (arr) => arr[Math.floor(Math.random() * arr.length)];

// random 3-letter string
const randId = () =>
  '   '.replace(/./g, () => randEl('abcdefghijklmnopqrstuvwxyz'));

const generateUnitLookup = (numUnits) => {
  const lookup = {xxx: 1};
  while (Object.keys(lookup).length < numUnits) {
    const num = Math.floor(Math.random() * 100);
    lookup[randId()] = Math.random() < 0.5 ? num : 1 / num;
  }
  return lookup;
};

const getEdgeKey = (to, from) => [to, from].sort().join('|');

const randEdge = (unitNames, seen) => {
  let to, from, seenKey;
  do {
    to = randEl(unitNames);
    from = randEl(unitNames);
    seenKey = getEdgeKey(to, from);
  } while (to === from || seen.has(seenKey));

  return {to, from};
};

const addConversion = (conversions, lookup, seen, to, from) => {
  seen.add(getEdgeKey(to, from));
  conversions.push([lookup[from] / lookup[to], from, to]);
};

const generateConversions = (numUnits = 100, numCycles = 50) => {
  const lookup = generateUnitLookup(numUnits);
  const unitNames = Object.keys(lookup);

  const seen = new Set();
  const conversions = [];

  for (let i = 1; i < numUnits; i++) {
    const to = randEl(unitNames.slice(0, i)) || 'xxx';
    addConversion(conversions, lookup, seen, to, unitNames[i]);
  }

  // add cycles
  for (let i = 0; i < numCycles; i++) {
    const {to, from} = randEdge(unitNames, seen);
    addConversion(conversions, lookup, seen, to, from);
  }

  shuffle(conversions); // just for good measure

  return {conversions, unitNames};
};

const iterations = 1000;

const {conversions, unitNames} = generateConversions();
const start = Date.now();
for (let i = 0; i < iterations; i++) {
  const from = randEl(unitNames);
  const to = randEl(unitNames);
  convert(conversions, from, to);
}
console.log((Date.now() - start) / iterations);
