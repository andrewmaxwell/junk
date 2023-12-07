const {XLSX} = window;
const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNj5GTusTsfQlo7FcTFieaD_x_bhdtKKp9gbfOoyX9q9Kde3UrYI-TehtpwkXfee9MVRI6848NzcO6/pub?output=xlsx';

const data = XLSX.read(await (await fetch(url)).arrayBuffer(), {
  cellDates: true,
}).Sheets;

for (const sheet in data) {
  data[sheet] = XLSX.utils.sheet_to_json(data[sheet]);
}

const peopleIndex = {};
const getPerson = (personName) =>
  (peopleIndex[personName] = peopleIndex[personName] || {ministries: []});

for (const {Name, Ministry} of data.Ministries) {
  getPerson(Name).ministries.push(Ministry);
}
for (const {Name, 'Member Since': memberSince} of data.Members) {
  getPerson(Name).memberSince = memberSince.toISOString().slice(0, 10);
}
for (const {Name} of data['Non-members']) {
  getPerson(Name);
}

const rows = Object.entries(peopleIndex)
  .map(([name, {ministries, memberSince = ''}]) => [
    name,
    memberSince,
    ministries.sort().join(', '),
  ])
  .sort();

document.querySelector('#result').innerHTML = `<table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Member Since</th>
        <th>Ministries</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join('')}</tr>`)
        .join('')}
    </tbody>
  </table>`;
