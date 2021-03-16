import {varNames, getExpr} from './simplifyExpr.js';

// https://en.wikipedia.org/wiki/Quine%E2%80%93McCluskey_algorithm

const getTable = (str) => {
  const headings = [...Array(Math.log2(str.length))]
    .map((v, i) => `<th>${varNames[i]}</th>`)
    .join('');

  const rows = str
    .split('')
    .map((v, i) => {
      const cols = i
        .toString(2)
        .padStart(Math.log2(str.length), '0')
        .split('')
        .map((c) => `<td>${c}</td>`)
        .join('');
      return `<tr>${cols}<td>${v}</td></tr>`;
    })
    .join('');

  return `<table><tr>${headings}<th>Value</th></tr>${rows}</table>`;
};

const onInput = () => {
  const {simplified, unsimplified} = getExpr(window.input.value);
  window.output.innerHTML = `<p>Unsimplified: ${unsimplified}</p><p>Simplified: ${simplified}</p>${getTable(
    window.input.value
  )}`;
};
window.input.addEventListener('input', onInput);
onInput();

// let result = '';
// for (let i = 2; i <= 4; i++) {
//   result += `\n${i} Variables\n\n`;
//   const numRows = 2 ** (2 ** i);
//   for (let j = 0; j < numRows; j++) {
//     const t = j.toString(2).padStart(2 ** i, '0');
//     result += `${j}. ${t}: ${getExpr(t)}\n`;
//   }
// }
// document.querySelector('#list').innerText = result;
