import {parse, parseGrammar} from './parse.js';
import {examples} from './examples.js';
import {renderAst} from './renderAst.js';

const debounce = (func, ms = 500) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), ms);
  };
};

const delimiter = '!!$$~~'; // something unlikely to appear in grammar or source
const encode = (grammar, code) => btoa(grammar + delimiter + code);
const decode = (str) => atob(str).split(delimiter);

document.querySelector('#examples').innerHTML += examples
  .map(
    ({name, grammar, code}) => `<a href="#${encode(grammar, code)}">${name}</a>`
  )
  .join('');

const grammarInput = document.querySelector('#grammar');
const inputInput = document.querySelector('#input');
const resultDiv = document.querySelector('#result');
const timeDiv = document.querySelector('#time');

const update = debounce(() => {
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
  resultDiv.innerHTML = renderAst(parsed);
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

if (location.hash.length < 2) {
  document.querySelector('#examples a').click();
} else {
  onHashChange();
}

window.addEventListener('hashchange', onHashChange);
