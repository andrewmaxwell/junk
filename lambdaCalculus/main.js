// https://en.wikipedia.org/wiki/Lambda_calculus
// https://justine.lol/lambda/

import {evaluate} from './evaluate.js';
import {tests} from './tests.js';

document.querySelector('#root').innerHTML = tests
  .map(
    ([input, , desc = '']) => `
    <div class="container">
      <p>${desc}</p>
      <textarea>${input.trim()}</textarea>
      <div class="result"></div>
      <div class="time"></div>
    </div>
  `
  )
  .join('');

document.querySelectorAll('textarea').forEach((target) => {
  const handler = () => {
    target.style.height = '1px';
    target.style.height = target.scrollHeight + 'px';
    if (target.value) {
      const start = performance.now();
      const result = evaluate(target.value);
      const time = (performance.now() - start).toFixed(1) + ' ms';
      target.nextElementSibling.innerHTML = `<span>= ${result}</span>`;
      target.nextElementSibling.nextElementSibling.innerHTML = time;
    } else {
      target.nextElementSibling.innerHTML = '';
      target.nextElementSibling.nextElementSibling.innerHTML = '';
    }
  };
  target.addEventListener('input', handler);
  handler();
});
