import {parse, parseGrammar} from './parse.js';
import {examples} from './examples.js';

const debounce = (func, ms = 500) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), ms);
  };
};

const delimiter = '!!$$~~';
const encode = (grammar, code) => btoa(grammar + delimiter + code);
const decode = (str) => atob(str).split(delimiter);

const escape = (str) =>
  ('' + str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const render = (obj, odd = false) => {
  if (Array.isArray(obj)) return obj.map((el) => render(el, odd)).join('');
  if (obj && typeof obj === 'object') {
    if (obj.errors) {
      const err = obj.errors.map((e) => e.error).join('\nOR\n');
      return `<pre class="error">${escape(err)}</pre>`;
    }
    return `<div class="obj ${odd ? 'odd' : 'even'}">
      <label>${escape(obj.type)}</label>
      <div>${render(obj.value, !odd)}</div>
    </div>`;
  }
  return `<div class="value">${escape(obj)}</div>`;
};

const grammarInput = document.querySelector('#grammar');
const inputInput = document.querySelector('#input');
const resultDiv = document.querySelector('#result');
const timeDiv = document.querySelector('#time');
const examplesDiv = document.querySelector('#examples');

const update = debounce(() => {
  console.clear();
  location.hash = encode(grammarInput.value, inputInput.value);
  let parsed;
  try {
    const grammar = parseGrammar(grammarInput.value);
    const input = inputInput.value.trim();
    const start = performance.now();
    parsed = parse(input, grammar);
    const time = performance.now() - start;
    timeDiv.innerHTML = `Parsed in ${Math.round(time * 10) / 10} ms`;
  } catch (e) {
    console.error(e);
    parsed = {error: e.message};
  }
  console.log(parsed);
  resultDiv.innerHTML = render(parsed);
});

grammarInput.addEventListener('input', update);
inputInput.addEventListener('input', update);

const onHashChange = () => {
  const [newGrammar, newInput] = decode(location.hash.slice(1));
  if (newGrammar !== grammarInput.value || newInput !== inputInput.value) {
    grammarInput.value = newGrammar;
    inputInput.value = newInput;
    update();
  }
};

examplesDiv.innerHTML += examples
  .map(
    ({name, grammar, code}) => `<a href="#${encode(grammar, code)}">${name}</a>`
  )
  .join('');

if (location.hash.length < 2) {
  document.querySelector('#examples a').click();
}

onHashChange();

window.addEventListener('hashchange', onHashChange);
