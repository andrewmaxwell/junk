const getData = async () => {
  const response = await fetch(
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ03_eRjHaTw-LlfgdomjIuuGo-aCG6-gK6-zivdQaZonq7AmOEIAua6A5GPh3LFMC4VEQykhRLLBDD/pub?output=tsv'
  );
  return await response.text();
};

const fromTSV = (str) => {
  const [headers, ...rows] = str.split('\r\n').map((l) => l.split('\t'));
  return rows.map((r) =>
    Object.fromEntries(
      headers.map((h, i) => [
        h.toLowerCase(),
        r[i] === '' || isNaN(r[i]) ? r[i] : Number(r[i]),
      ])
    )
  );
};

const parseWeights = (weights) =>
  Object.fromEntries(
    weights.split(/\s*,\s*/).map((nameAndValue) => {
      const [person2Name, weight] = nameAndValue
        .split(':')
        .map((s) => s.trim());
      return [person2Name, Number(weight)];
    })
  );

const withWeightsMirrored = (people) => {
  for (const {weights, name} of people) {
    for (const person2Name in weights) {
      const person2 = people.find((p) => p.name === person2Name);
      if (person2) person2.weights[name] = weights[person2Name];
    }
  }
  return people;
};

export default async () => {
  const people = fromTSV(await getData()).filter((p) => !p.absent);
  for (const person of people) person.weights = parseWeights(person.weights);
  return withWeightsMirrored(people);
};
