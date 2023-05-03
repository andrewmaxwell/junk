const {Papa} = window;

const normalizeByPerson = false;
const normalizeByQuestion = false;
const colorThreshold = 15;

const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTass7p8cGivjWrAA9TRot_qISNUzyilgcnbFA4tmhP4b1lgk6JKlzL3R3FPLpBksY1ebswFMtQALmF/pub?output=csv';

const getDiff = (p1, p2) =>
  Math.hypot(...Object.keys(p1).map((key) => p1[key] - p2[key]));

const getData = async () => (await fetch(url)).text();

const processData = (data) =>
  Papa.parse(data, {
    header: true,
  })
    .data.map((row) => {
      const name = row['Your Name'].trim();
      return {
        firstName: name.split(' ')[0],
        lastName: name.split(' ').pop(),
        name,
        data: Object.fromEntries(
          Object.entries(row)
            .map(([key, val]) => [key, +val])
            .filter(([, val]) => !isNaN(val))
        ),
      };
    })
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
    );

const sortData = (data) => {
  for (const row of data) {
    row.scores = {};
    row.totalDiff = 0;
    for (const r of data) {
      row.totalDiff += row.scores[r.name] = getDiff(row.data, r.data);
    }
  }
  return data.sort((a, b) => a.totalDiff - b.totalDiff);
};

const normalize = (data) => {
  if (normalizeByPerson) {
    for (const row of data) {
      const vals = Object.values(row.data);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      console.log(row.name, min, max);
      for (const key in row.data) {
        row.data[key] = (row.data[key] - min) / (max - min);
      }
    }
  }

  if (normalizeByQuestion) {
    for (const key in data[0].data) {
      const vals = data.map((row) => row.data[key]);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      console.log(key, min, max);
      for (const row of data) {
        row.data[key] = (row.data[key] - min) / (max - min);
      }
    }
  }

  return data;
};

const getColor = (x, threshold) =>
  x < threshold
    ? `rgba(0,255,0,${1 - x / threshold})`
    : `rgba(255,0,0,${x / threshold - 1})`;

const makeTable = (headers, rows) => `<table>
<thead>
  <tr>
    <th></th>
    ${headers}
  </tr>
</thead>
<tbody>${rows}</tbody>
</table>`;

const similarityTable = (data) => {
  const headers = data
    .map(({name}) => `<th><div><span>${name}</span></div></th>`)
    .join('');

  const rows = data
    .map(({name}) => {
      const cols = data
        .map(
          ({scores}) =>
            `<td style="background:${getColor(
              scores[name],
              colorThreshold
            )}"></td>`
        )
        .join('');
      return `<tr><th>${name}</th>${cols}</tr>`;
    })
    .join('');

  return makeTable(headers, rows);
};

// const getPairList = (data) => {
//   const pairs = [];
//   for (const {name: n1, data: p1} of data) {
//     for (const {name: n2, data: p2} of data) {
//       if (n1 < n2) pairs.push({n1, n2, d: getDiff(p1, p2)});
//     }
//   }
//   return (
//     `<h1>Most Alike to Least Alike</h1>` +
//     pairs
//       .sort((a, b) => a.d - b.d)
//       .map(({n1, n2, d}) => `<div>${n1} and ${n2}: ${d.toFixed(1)}</div>`)
//       .join('')
//   );
// };

const num = 5;
const getMostAndLeast = (data) =>
  data
    .map((row) => {
      const people = Object.entries(row.scores)
        .filter((a) => a[0] !== row.name)
        .sort((a, b) => a[1] - b[1])
        .map(([name, score]) => `${name} (${score.toFixed(1)})`);
      const alike = people.slice(0, num).join(', ');
      const different = people.slice(-num).reverse().join(', ');
      return `
      <br/>
      <h3>${row.name}</h3>
      <strong>Most Similar</strong>: ${alike}<br/>
      <strong>Most Different</strong>: ${different}<br/>`;
    })
    .join('');

const getAnswerTables = (data) =>
  Object.keys(data[0].data)
    .map((key) => {
      const groups = {};
      for (const row of data) {
        const val = row.data[key];
        (groups[val] = groups[val] || []).push(row.name);
      }
      const list = [...Array(10).keys()]
        .map((i) => `<div>${i + 1}: ${(groups[i + 1] || []).join(', ')}</div>`)

        .join('');
      return `<h1>${key}</h1>${list}`;
    })
    .join('');

const makeHtml = (data) => `
${similarityTable(data)}
${getMostAndLeast(data)}
${getAnswerTables(data)}
`;

const main = async () => {
  const data = normalize(sortData(processData(await getData())));
  console.log(data);
  document.body.innerHTML += makeHtml(data);
};
main();
