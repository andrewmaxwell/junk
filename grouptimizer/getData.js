const {XLSX} = window;

const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ03_eRjHaTw-LlfgdomjIuuGo-aCG6-gK6-zivdQaZonq7AmOEIAua6A5GPh3LFMC4VEQykhRLLBDD/pub?output=xlsx';

const parseWeights = (weights = '') =>
  Object.fromEntries(
    weights.split(',').map((nameAndValue) => {
      const [person2Name, weight] = nameAndValue
        .split(':')
        .map((s) => s.trim());
      return [person2Name, Number(weight)];
    })
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

const processPeople = (people) =>
  mirrorWeights(
    people.map((row) => ({
      id: row.id,
      name: row.Name,
      absent: row.Absent,
      sponsor: row.Sponsor || 0,
      grade: row.Grade,
      gender: row.Gender,
      contrib: row.Contrib || 0,
      weights: parseWeights(row.Weights || ''),
    }))
  );

export const getData = async () => {
  const response = await fetch(url);
  const data = XLSX.read(await response.arrayBuffer(), {
    cellDates: true,
  }).Sheets;
  return {
    attendance: XLSX.utils.sheet_to_json(data.Attendance),
    people: processPeople(XLSX.utils.sheet_to_json(data.People)),
  };
};
