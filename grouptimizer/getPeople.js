const {evolve, map, pipe, fromPairs, split, trim} = window.R;

const getData = async () => {
  const response = await fetch(
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ03_eRjHaTw-LlfgdomjIuuGo-aCG6-gK6-zivdQaZonq7AmOEIAua6A5GPh3LFMC4VEQykhRLLBDD/pub?output=tsv'
  );
  return await response.text();
};

const processRow = (row, headers) =>
  Object.fromEntries(
    headers.map((h, i) => [
      h.toLowerCase(),
      row[i] === '' || isNaN(row[i]) ? row[i] : Number(row[i]),
    ])
  );

const fromTSV = (str) => {
  const [headers, ...rows] = str.split('\r\n').map((l) => l.split('\t'));
  return rows.map((r) => processRow(r, headers));
};

const parseWeights = pipe(
  split(','),
  map((nameAndValue) => {
    const [person2Name, weight] = nameAndValue.split(':').map(trim);
    return [person2Name, Number(weight)];
  }),
  fromPairs
);

const mirrorWeights = (people) => {
  for (const {weights, name} of people) {
    for (const person2Name in weights) {
      const person2 = people.find((p) => p.name === person2Name);
      if (person2) person2.weights[name] = weights[person2Name];
    }
  }
  return people;
};

const processData = pipe(
  fromTSV,
  map(evolve({weights: parseWeights})),
  mirrorWeights
);

export default () => getData().then(processData);
