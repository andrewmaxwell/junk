let seed = 1;
const rand = () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// shuffles an array using Fisher-Yates algorithm
const shuffle = (arr) => {
  for (let counter = arr.length; counter; ) {
    const index = Math.floor(rand() * counter--);
    [arr[counter], arr[index]] = [arr[index], arr[counter]];
  }
  return arr;
};

// randomizes who gets who, could have invalid matches
const getInitial = (people) => {
  const shuffled = shuffle(people.slice());
  return people.map((p, i) => ({...p, match: shuffled[i].name}));
};

// returns the index of the first person with a bad match, otherwise -1
const getIndexOfBad = (result) =>
  result.findIndex(
    ({name, exclude, match}) => name === match || exclude.includes(match)
  );

// swaps people between the person at indexOfBad and a random other person
const swapWithRandom = (result, indexOfBad) => {
  const index = Math.floor(rand() * result.length);
  const temp = result[indexOfBad].match;
  result[indexOfBad].match = result[index].match;
  result[index].match = temp;
};

const generateMatches = (people) => {
  let result = getInitial(people);

  for (let i = 0; i < 1e6; i++) {
    const indexOfBad = getIndexOfBad(result);
    if (indexOfBad === -1) return result;
    swapWithRandom(result, indexOfBad);
  }
};

const getOutput = (result, personIndex) => {
  if (!result) return 'No solution found.';

  if (result[personIndex]) {
    const {name, match} = result[personIndex];
    return `${name} will get a gift for ${match}`;
  }

  return result
    .map(
      ({name}, i) =>
        `<a href="${location.href.replace('_', i)}">Link for ${name}</a>`
    )
    .join('\n');
};

const go = () => {
  const [[origSeed, personIndex], ...parts] = location.hash
    .slice(1)
    .split(';')
    .map((p) => p.split(','));

  seed = Number(origSeed);

  const result = generateMatches(
    parts.map(([name, ...x], i, arr) => ({
      name,
      exclude: x.map((i) => arr[i][0]),
    }))
  );

  window.output.innerHTML = getOutput(result, personIndex);
};

go();

// #1,3;Taylor,3,1;Jim,4,5;Emmett,3;Helen,0,6;Susan,1,7;Olivia,2;Dootman,0,7;PuddingGlove,4,6
