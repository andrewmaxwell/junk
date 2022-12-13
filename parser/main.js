import {debounce} from '../misc/debounce.js';
import {examples} from './examples.js';
import {renderAst} from './renderAst.js';

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
const errorDiv = document.querySelector('#error');

const onHashChange = () => {
  const [newGrammar, newInput] = decode(location.hash.slice(1));
  if (newGrammar !== grammarInput.value || newInput !== inputInput.value) {
    grammarInput.value = newGrammar;
    inputInput.value = newInput;
    update();
  }
};

const updateHash = debounce(() => {
  window.removeEventListener('hashchange', onHashChange);
  location.hash = encode(grammarInput.value, inputInput.value);
  window.addEventListener('hashchange', onHashChange);
});

let worker;

const update = () => {
  updateHash();

  worker?.terminate();
  resultDiv.innerHTML = 'Parsing...';
  timeDiv.innerHTML = '';
  errorDiv.innerHTML = '';

  const code = inputInput.value.trim();

  worker = new Worker('./worker.js', {type: 'module'});
  worker.addEventListener('message', ({data: {parsed, time}}) => {
    console.log(parsed);
    resultDiv.innerHTML = renderAst(parsed);
    timeDiv.innerHTML = `Parsed in ${Math.round(time * 10) / 10} ms`;
    if (parsed.errors) {
      errorDiv.innerText = parsed.errors.map((e) => e.error).join('\nOR\n');
    }
    if (parsed.length < code.length) {
      errorDiv.innerText = `Stopped parsing at: ${code.slice(parsed.length)}`;
    }
  });
  worker.postMessage({
    grammarStr: grammarInput.value,
    code,
  });
};

grammarInput.addEventListener('input', update);
inputInput.addEventListener('input', update);

if (location.hash.length < 2) {
  document.querySelector('#examples a').click();
} else {
  onHashChange();
}

window.addEventListener('hashchange', onHashChange);
