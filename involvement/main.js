const getRows = async () => {
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
      ({Name, Absent}) => [Name, {Absent, ministries: []}]
    )
  );
  for (const {Name, Ministry} of data.Ministries) {
    peopleIndex[Name].ministries.push(Ministry);
  }
  for (const {Name, 'Member Since': memberSince} of data.Members) {
    peopleIndex[Name].memberSince = memberSince.toISOString().slice(0, 10);
  }

  return Object.entries(peopleIndex)
    .filter(([, {Absent}]) => !Absent)
    .map(([name, {ministries, memberSince = ''}]) => [
      name,
      memberSince,
      ministries.sort().join(', '),
    ])
    .sort();
};

const rows = await getRows();

const render = (searchValue) => {
  window.tbody.innerHTML = rows
    .filter((row) => row.join('|').toUpperCase().includes(searchValue))
    .map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join('')}</tr>`)
    .join('');
};

window.search.addEventListener('input', (e) => {
  render(e.target.value.toUpperCase());
});

render('');
