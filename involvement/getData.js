export const getData = async () => {
  const {XLSX} = window;
  const url =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNj5GTusTsfQlo7FcTFieaD_x_bhdtKKp9gbfOoyX9q9Kde3UrYI-TehtpwkXfee9MVRI6848NzcO6/pub?output=xlsx';
  const data = XLSX.read(await (await fetch(url)).arrayBuffer(), {
    cellDates: true,
  }).Sheets;

  for (const sheet in data) {
    data[sheet] = XLSX.utils.sheet_to_json(data[sheet]);
  }

  const peopleIndex = Object.fromEntries(
    [...data.Members, ...data.Ministries, ...data['Non-members']].map(
      ({Name, Absent}) => [Name, {Absent, ministries: [], smallGroups: []}]
    )
  );
  for (const {Name, Ministry} of data.Ministries) {
    peopleIndex[Name].ministries.push(Ministry);
  }
  for (const {Name, 'Member Since': memberSince} of data.Members) {
    peopleIndex[Name].memberSince = memberSince.toISOString().slice(0, 10);
  }

  for (const {Name, Group} of data['Small Groups']) {
    if (peopleIndex[Name]) {
      peopleIndex[Name].smallGroups.push(Group);
    } else {
      console.log(Name, 'not found');
    }
  }

  return Object.entries(peopleIndex)
    .filter(([, {Absent}]) => !Absent)
    .map(([name, {ministries, memberSince = '', smallGroups}]) => ({
      name,
      memberSince,
      ministries: ministries.sort().join(', '),
      smallGroups: smallGroups.sort().join(', '),
    }));
};
