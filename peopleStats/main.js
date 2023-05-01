const {Papa} = window;

const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTass7p8cGivjWrAA9TRot_qISNUzyilgcnbFA4tmhP4b1lgk6JKlzL3R3FPLpBksY1ebswFMtQALmF/pub?output=csv';

const lastName = ({name}) => name.split(' ')[1];

const getData = async () => (await fetch(url)).text();

const processData = (data) =>
  Papa.parse(data, {
    header: true,
  })
    .data.map((row) => ({
      name: row['Your Name'],
      data: Object.fromEntries(
        Object.entries(row)
          .map(([key, val]) => [key, +val])
          .filter(([, val]) => !isNaN(val))
      ),
    }))
    .sort((a, b) => lastName(a).localeCompare(lastName(b)));

// const normalize = (data) => {
//   for (const key in data[0].data) {
//     const vals = data.map((row) => row.data[key]);
//     const min = Math.min(...vals);
//     const max = Math.max(...vals);
//     console.log(key, min, max);
//     for (const row of data) {
//       row.data[key] = (row.data[key] - min) / (max - min);
//     }
//   }
//   return data;
// };

const getDiff = (p1, p2) => {
  let total = 0;
  for (const key in {...p1, ...p2}) {
    total += (p1[key] - p2[key]) ** 2;
  }
  return Math.sqrt(total);
};

const getColor = (x, threshold) =>
  x < threshold
    ? `rgba(0,255,0,${1 - x / threshold})`
    : `rgba(255,0,0,${x / threshold - 1})`;

const makeTable = (data) => {
  const headers = data
    .map(({name}) => `<th><div><span>${name}</span></div></th>`)
    .join('');

  const pairs = [];

  const rows = data
    .map(({name: n1, data: p1}) => {
      const cols = data
        .map(({name: n2, data: p2}) => {
          const d = getDiff(p1, p2);
          if (n1 < n2) pairs.push({n1, n2, d});
          return `<td style="background:${getColor(d, 16)}"></td>`;
        })
        .join('');
      return `<tr><th>${n1}</th>${cols}</tr>`;
    })
    .join('');

  const list = pairs
    .sort((a, b) => a.d - b.d)
    .map(({n1, n2, d}) => `<div>${n1} and ${n2}: ${d.toFixed(1)}</div>`)
    .join('');

  return `<table>
  <thead>
    <tr>
      <th></th>
      ${headers}
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<h1>Most Alike to Least Alike</h1>
${list}`;
};

const main = async () => {
  const data = processData(await getData());
  console.log(data);
  document.body.innerHTML += makeTable(data);
};
main();
