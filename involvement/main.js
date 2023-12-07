const get = async (filename) => (await fetch(filename)).text();

const convertName = (name) => {
  const [first, last] = name.split(' ');
  return `${last}, ${first}`;
};

const peopleIndex = {};

const getPerson = (personName) => {
  if (!peopleIndex[personName]) {
    peopleIndex[personName] = {ministries: []};
  }
  return peopleIndex[personName];
};

for (const chunk of (await get('ministryOrg.txt')).split('\n\n')) {
  const [ministryName, ...people] = chunk.split('\n').map((r) => r.trim());
  for (const p of people) {
    getPerson(convertName(p)).ministries.push(ministryName);
  }
}

for (const row of (await get('members.txt')).split('\n')) {
  const [memberName, joinDate] = row.split('\t');
  getPerson(memberName).joinDate = joinDate;
}

for (const personName of (await get('nonMembers.txt')).split('\n')) {
  getPerson(personName);
}

console.log(peopleIndex);

const rows = Object.entries(peopleIndex)
  .map(([name, {ministries, joinDate = ''}]) => [
    name,
    joinDate,
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
