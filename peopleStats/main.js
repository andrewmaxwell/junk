import {correlationCoefficient} from './correlationCoefficient.js';
import {getData} from './getData.js';
import {makePeopleGraph} from './makePeopleGraph.js';

// const normalizeByPerson = false;
// const normalizeByQuestion = false;
const colorThreshold = 16;

const toId = (str) => str.replace(/\W/g, '');
const nameLink = (name) => `<a href="#${toId(name)}">${name}</a>`;

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

const similarityTable = (data) => {
  const headers = data
    .map(({name}) => `<th><div><span>${nameLink(name)}</span></div></th>`)
    .join('');

  const rows = data
    .map(({name}) => {
      const cols = data
        .map(({name: n2, scores}) => {
          const color =
            scores[name] < colorThreshold
              ? `rgba(0,255,0,${1 - scores[name] / colorThreshold})`
              : `rgba(255,0,0,${scores[name] / colorThreshold - 1})`;
          const title = `${name} & ${n2}: ${scores[name].toFixed(1)}`;
          return `<td style="background:${color}" title="${title}"></td>`;
        })
        .join('');
      return `<tr><th>${nameLink(name)}</th>${cols}</tr>`;
    })
    .join('');

  return `
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

const correlationTable = (data) => {
  const questions = Object.keys(data[0].answers).map((key) => ({
    key,
    answers: data.map((d) => d.answers[key]),
    scores: {},
    totalCorr: 0,
  }));

  for (const q1 of questions) {
    for (const q2 of questions) {
      q1.totalCorr += q1.scores[q2.key] = correlationCoefficient(
        q1.answers,
        q2.answers
      );
    }
  }

  questions.sort((a, b) => b.totalCorr - a.totalCorr);

  const headers = questions
    .map(({key}) => `<th><div><span>${key}</span></div></th>`)
    .join('');

  const rows = questions
    .map((q1) => {
      const cols = questions
        .map((q2) => {
          const corr = q1.key === q2.key ? 1 : q1.scores[q2.key];
          const color =
            corr < 0 ? `rgba(255,0,0,${-corr})` : `rgba(0,255,0,${corr})`;
          const title = `${q1.key} & ${q2.key}: ${corr}`;
          return `<td style="background:${color}" title="${title}"></td>`;
        })
        .join('');
      return `<tr><th>${q1.key}</th>${cols}</tr>`;
    })
    .join('');

  return `<h1>Answer Correlations</h1>
  <p>Green means positively correlated. Red means negatively correlated. Black means no correlation.<p>
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

const correlationList = (data) => {
  const questions = Object.keys(data[0].answers).map((key) => ({
    key,
    answers: data.map((d) => d.answers[key]),
  }));

  const correlations = [];
  for (const q1 of questions) {
    for (const q2 of questions) {
      if (q1.key >= q2.key) continue;
      correlations.push({
        q1,
        q2,
        correlation: correlationCoefficient(q1.answers, q2.answers),
      });
    }
  }

  return (
    '<h1>Correlations</h1>' +
    correlations
      .sort((a, b) => b.correlation - a.correlation)
      .map(
        ({q1, q2, correlation}) =>
          `<div>${q1.key} & ${q2.key}: ${correlation.toFixed(2)}</div>`
      )
      .join('')
  );
};

const peopleGraph = (data) => {
  setTimeout(() => makePeopleGraph('peopleGraph', data), 100);
  return `<p>People that are close to each other gave similar answers to the survey. The further away people are, the more different their answers. </p>
  <p>Since it's presented in two dimensions, it's not 100% accurate. Blue lines indicate that two people should actually be further apart. Yellow lines mean they should be closer.</p>
  <p>Try dragging names around!</p>
  <canvas id="peopleGraph"></canvas>`;
};

const main = async () => {
  const hidden =
    Object.fromEntries(new URLSearchParams(location.search)).hide?.split(',') ||
    [];

  const hash = location.hash.slice(1);
  location.hash = '';

  const data = await getData(hidden);
  console.log(data);

  document.body.innerHTML += [
    getShowAll(hidden),
    '<h1>Results</h1>',
    peopleGraph(data),
    similarityTable(data),
    correlationTable(data),
    getMostAndLeast(data),
    getAnswerTables(data),
    correlationList(data),
  ].join('');

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
