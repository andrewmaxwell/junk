import {parse} from './parse.js';

const parseGrammar = (str) =>
  str.split('\n').reduce((res, l) => {
    const name = l.split(':', 1)[0].trim();
    const val = l.slice(name.length + 1).trim();
    if (name && val)
      res[name] =
        val[0] === '^'
          ? new RegExp(val)
          : !val.includes(' ')
          ? {any: val.split('|')}
          : {concat: val.split(' ')};
    return res;
  }, {});

const render = (obj) => {
  if (Array.isArray(obj)) return obj.map(render).join('');
  if (obj && typeof obj === 'object') {
    return `<div class="obj">
      <label>${obj.type}</label>
      <div>${render(obj.value)}</div>
    </div>`;
  }
  return `<div class="value">${obj}</div>`;
};

const grammarInput = document.querySelector('#grammar');
const inputInput = document.querySelector('#input');
const resultDiv = document.querySelector('#result');

const update = () => {
  console.clear();
  location.hash = encodeURIComponent(
    JSON.stringify([grammarInput.value.trim(), inputInput.value.trim()])
  );
  try {
    const grammar = parseGrammar(grammarInput.value);
    const input = inputInput.value.trim();
    const parsed = parse(input, grammar);
    resultDiv.innerHTML = render(parsed);
  } catch (e) {
    resultDiv.innerHTML = e.message;
  }
};

grammarInput.addEventListener('input', update);
inputInput.addEventListener('input', update);

if (location.hash.length > 1) {
  [grammarInput.value, inputInput.value] = JSON.parse(
    decodeURIComponent(location.hash.slice(1))
  );
}
update();
