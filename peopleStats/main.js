const {Papa} = window;

// const normalizeByPerson = false;
// const normalizeByQuestion = false;
const colorThreshold = 16;

const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTass7p8cGivjWrAA9TRot_qISNUzyilgcnbFA4tmhP4b1lgk6JKlzL3R3FPLpBksY1ebswFMtQALmF/pub?output=csv';

const getDiff = (p1, p2) =>
  Math.hypot(...Object.keys(p1).map((key) => p1[key] - p2[key]));

const toId = (str) => str.replace(/\W/g, '');
const nameLink = (name) => `<a href="#${toId(name)}">${name}</a>`;

const getData = async () => (await fetch(url)).text();

const processData = (str, hidden) => {
  const data = Papa.parse(str, {
    header: true,
  })
    .data.map((row) => ({
      name: row['Your Name'].trim(),
      answers: Object.fromEntries(
        Object.entries(row)
          .map(([key, val]) => [key, +val])
          .filter(([, val]) => !isNaN(val))
      ),
    }))
    .filter(({name}) => !hidden.includes(name));

  for (const row of data) {
    row.scores = {};
    row.totalDiff = 0;
    for (const r of data) {
      row.totalDiff += row.scores[r.name] = getDiff(row.answers, r.answers);
    }
  }
  return data.sort((a, b) => a.totalDiff - b.totalDiff);
};

// const normalize = (data) => {
//   if (normalizeByPerson) {
//     for (const row of data) {
//       const vals = Object.values(row.answers);
//       const min = Math.min(...vals);
//       const max = Math.max(...vals);
//       console.log(row.name, min, max);
//       for (const key in row.answers) {
//         row.answers[key] = (row.answers[key] - min) / (max - min);
//       }
//     }
//   }

//   if (normalizeByQuestion) {
//     for (const key in data[0].answers) {
//       const vals = data.map((row) => row.answers[key]);
//       const min = Math.min(...vals);
//       const max = Math.max(...vals);
//       console.log(key, min, max);
//       for (const row of data) {
//         row.answers[key] = (row.answers[key] - min) / (max - min);
//       }
//     }
//   }

//   return data;
// };

const getColor = (x, threshold) =>
  x < threshold
    ? `rgba(0,255,0,${1 - x / threshold})`
    : `rgba(255,0,0,${x / threshold - 1})`;

const similarityTable = (data) => {
  const headers = data
    .map(({name}) => `<th><div><span>${nameLink(name)}</span></div></th>`)
    .join('');

  const rows = data
    .map(({name}) => {
      const cols = data
        .map(({name: n2, scores}) => {
          const color = getColor(scores[name], colorThreshold);
          const title = `${name} & ${n2}: ${scores[name].toFixed(1)}`;
          return `<td style="background:${color}" title="${title}"></td>`;
        })
        .join('');
      return `<tr><th>${nameLink(name)}</th>${cols}</tr>`;
    })
    .join('');

  return `
  
  <h1>Results</h1>
  <p>Green means more similar. Red means different. The bright green diagonal is because everyone is 100% similar to themselves.<p>
  <p>People at the top tended to give more moderate answers and people at the bottom tended toward extremes.</p>
  <table>
    <thead>
      <tr>
        <th></th>
        ${headers}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
};

// const getPairList = (data) => {
//   const pairs = [];
//   for (const {name: n1, answers: p1} of data) {
//     for (const {name: n2, answers: p2} of data) {
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
        .map(
          ([name, score]) =>
            `${nameLink(name)} <span class="paren">${score.toFixed(1)}</span>`
        );
      const alike = people.slice(0, num).join(', ');
      const different = people.slice(-num).reverse().join(', ');
      return `
      <br/>
      <h3 id="${toId(row.name)}">${row.name}<button>hide</button></h3>
      <strong>Most Similar</strong>: ${alike}<br/>
      <strong>Most Different</strong>: ${different}<br/>`;
    })
    .join('');

const getAnswerTables = (data) =>
  Object.keys(data[0].answers)
    .map((key) => {
      const groups = {};
      for (const row of data) {
        const val = row.answers[key];
        (groups[val] = groups[val] || []).push(row.name);
      }
      const list = [...Array(10).keys()]
        .map((i) => {
          const nameList = (groups[i + 1] || []).map(nameLink).join(', ');
          return `<div>${i + 1}: ${nameList}</div>`;
        })

        .join('');
      return `<h1>${key}</h1>${list}`;
    })
    .join('');

const getShowAll = (hidden) =>
  hidden.length
    ? `<p>
        Some people are hidden: ${hidden.join(', ')}. 
        <button>Show All</button>
      </p>`
    : '';

const main = async () => {
  const hidden =
    Object.fromEntries(new URLSearchParams(location.search)).hide?.split(',') ||
    [];

  const hash = location.hash.slice(1);
  location.hash = '';

  const data = processData(await getData(), hidden);
  console.log(data);

  document.body.innerHTML += `
    ${getShowAll(hidden)}
    ${similarityTable(data)}
    ${getMostAndLeast(data)}
    ${getAnswerTables(data)}
  `;

  document.addEventListener('click', (e) => {
    switch (e.target.textContent.toLowerCase()) {
      case 'hide': {
        const name = e.target.previousSibling.textContent;
        location.href = `?hide=${encodeURIComponent(
          [...hidden, name].join(',')
        )}`;
        break;
      }
      case 'show all': {
        location.href = location.href.replace(/\?.*/, '');
      }
    }
  });

  if (hash) location.hash = hash;
};

main();
