import {parse} from './parse.js';

const debounce = (func, ms = 500) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), ms);
  };
};

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

const escape = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const render = (obj) => {
  if (Array.isArray(obj)) return obj.map(render).join('');
  if (obj && typeof obj === 'object') {
    if (obj.error) return `<pre class="error">${escape(obj.error)}</pre>`;
    return `<div class="obj">
      <label>${escape(obj.type)}</label>
      <div>${render(obj.value)}</div>
    </div>`;
  }
  return `<div class="value">${escape(obj)}</div>`;
};

const grammarInput = document.querySelector('#grammar');
const inputInput = document.querySelector('#input');
const resultDiv = document.querySelector('#result');

const setHash = debounce(() => {
  location.hash = encodeURIComponent(
    JSON.stringify([grammarInput.value, inputInput.value])
  );
});

const update = () => {
  console.clear();
  setHash();
  let parsed;
  try {
    const grammar = parseGrammar(grammarInput.value);
    const input = inputInput.value.trim();
    parsed = parse(input, grammar);
  } catch (e) {
    console.error(e);
    parsed = {error: e.message};
  }
  console.log(parsed);
  resultDiv.innerHTML = render(parsed);
};

grammarInput.addEventListener('input', update);
inputInput.addEventListener('input', update);

const onHashChange = () => {
  [grammarInput.value, inputInput.value] = JSON.parse(
    decodeURIComponent(location.hash.slice(1))
  );
  update();
};

onHashChange();

window.addEventListener('hashchange', onHashChange);
