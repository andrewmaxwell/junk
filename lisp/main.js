import {parse} from './parse.js';
import {execute} from './execute.js';
import {tests} from './tests.js';

const exec = (str) => {
  try {
    return execute(parse(str));
  } catch (e) {
    return e.message;
  }
};

document.querySelector('#root').innerHTML = tests
  .map(
    ([input, , desc = ''], i) => `
    <div class="container">
      <p>${desc}</p>
      <textarea data-id="${i}">${input.trim()}</textarea>
      <div class="result"><span id="result-${i}"></span></div>
    </div>
  `
  )
  .join('');

const formatOutput = (val) =>
  Array.isArray(val) ? `(${val.map(formatOutput).join(' ')})` : val;

document.querySelectorAll('textarea').forEach((target) => {
  const handler = () => {
    target.style.height = '1px';
    target.style.height = 5 + target.scrollHeight + 'px';
    document.querySelector(`#result-${target.dataset.id}`).innerHTML =
      target.value ? formatOutput(exec(target.value)) : '';
  };
  target.addEventListener('input', handler);
  handler();
});
