// shuffles an array using Fisher-Yates algorithm
const shuffle = (arr) => {
  for (let counter = arr.length; counter; ) {
    const index = Math.floor(Math.random() * counter--);
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
    ({name, exclude, match}) =>
      name === match || exclude.includes(match.toUpperCase())
  );

// swaps people between the person at indexOfBad and a random other person
const swapWithRandom = (result, indexOfBad) => {
  const index = Math.floor(Math.random() * result.length);
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

const go = () => {
  const result = generateMatches(
    window.input.value
      .trim()
      .split('\n')
      .filter((r) => r.trim())
      .map((r) => {
        const [name, exclude] = r.split(/\s*-\s*/);
        return {name, exclude: exclude.toUpperCase()};
      })
  );

  window.output.innerHTML = result
    .map(
      ({name, match}) =>
        `<a href="${location.href}#${btoa(match)}">Link for ${name}</a>`
    )
    .join('\n');
};

window.input.addEventListener('input', go);

if (location.hash)
  document.body.innerHTML = `You'll get a gift for ${atob(
    location.hash.slice(1)
  )}`;
else go();
