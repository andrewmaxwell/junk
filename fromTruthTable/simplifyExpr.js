// takes a string of truthValues like 1001 and returns an array of strings representing the min terms, like ['00', '11']
const getMinTerms = (truthValues) =>
  truthValues
    .split('')
    .map(
      (v, i) =>
        v === '1' && i.toString(2).padStart(Math.log2(truthValues.length), '0')
    )
    .filter((i) => i);

// takes two strings and if they have only one character different, returns it with that character turned to an underscore
const setUnderscore = (a, b) => {
  let index = -1;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    index = i;
    count++;
  }
  return count === 1 && `${a.slice(0, index)}_${a.slice(index + 1)}`;
};

// takes an array of strings and returns the possible combinations with underscores
const combineImplicants = (nums) => {
  const r = new Set(nums);
  for (let i = 1; i < nums.length; i++) {
    for (let j = 0; j < i; j++) {
      const x = setUnderscore(nums[i], nums[j]);
      if (x) {
        r.add(x);
        r.delete(nums[i]);
        r.delete(nums[j]);
      }
    }
  }
  return [...r];
};

// applies combineImplicants until everything is simplified
const getPrimeImplicants = (minTerms) => {
  if (!minTerms.length) return [];
  let prev = minTerms;
  let result = combineImplicants(minTerms);
  while (prev.toString() !== result.toString()) {
    prev = result;
    result = combineImplicants(result);
  }
  return result;
};

// takes an array of implicants and returns the truthValues it describes
const evaluate = (implicants) =>
  [...Array(2 ** implicants[0].length)]
    .map((v, i) => {
      const vals = i.toString(2).padStart(implicants[0].length, '0').split('');
      return implicants.some((c) =>
        c.split('').every((v, j) => v === '_' || v === vals[j])
      );
    })
    .map(Number)
    .join('');

// removes implicants that do not affect the truthValue
const getEssential = (primeImplicants, truthValue) => {
  let result = primeImplicants;
  for (let i = primeImplicants.length - 1; i >= 0 && result.length > 1; i--) {
    const w = [...result.slice(0, i), ...result.slice(i + 1)];
    if (evaluate(w) === truthValue) result = w;
  }
  return result;
};

export const varNames = 'ABCDEGHIJKLMNPQRSUVWXYZ';

const toString = (implicants) =>
  implicants
    .map((n) => {
      const stuff = n
        .split('')
        .map((x, i) => x !== '_' && (x === '0' ? '!' : '') + varNames[i])
        .filter((i) => i);
      return stuff.length > 1
        ? `(${stuff.join('&')})`
        : stuff.length === 1
        ? stuff[0]
        : 'T';
    })
    .join('|') || 'F';

export const getExpr = (truthValue) => {
  const minTerms = getMinTerms(truthValue);
  const primeImplicants = getPrimeImplicants(minTerms);
  const essential = getEssential(primeImplicants, truthValue);
  return {simplified: toString(essential), unsimplified: toString(minTerms)};
};
