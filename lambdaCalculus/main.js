// https://en.wikipedia.org/wiki/Lambda_calculus
// https://justine.lol/lambda/

import {tests} from './tests.js';

document.querySelector('#root').innerHTML = tests
  .map(
    ([desc, input], id) => `
    <div class="container">
      <p>${desc}</p>
      <textarea>${input.trim()}</textarea>
      <div id="t${id}" class="steps"></div>
      <div class="result"></div>
      <div class="time"></div>
    </div>
  `
  )
  .join('<hr />');

// evaluate in a web worker some if something is really slow or crashes it doesn't break the whole page maybe
const worker = new Worker('worker.js', {type: 'module'});
worker.addEventListener('message', ({data: {result, steps, time, id}}) => {
  const target = document.querySelector('#t' + id);
  const pad = Math.floor(Math.log10(steps.length) + 1);
  target.innerHTML = `<span>${steps
    .map((line, i) => `<i>${(i + 1).toString().padStart(pad)}.</i> ${line}`)
    .join('\n')}</span>`;
  target.scrollTop = target.scrollHeight;
  target.nextElementSibling.innerHTML = `<span>${result}</span>`;
  target.nextElementSibling.nextElementSibling.innerHTML = time;
});

document.querySelectorAll('textarea').forEach((target, id) => {
  const handler = () => {
    if (target.value) {
      target.style.height = '1px';
      target.style.height = target.scrollHeight + 'px';
      worker.postMessage({id, value: target.value});
    } else {
      target.nextElementSibling.innerHTML = '';
      target.nextElementSibling.nextElementSibling.innerHTML = '';
      target.nextElementSibling.nextElementSibling.nextElementSibling.innerHTML =
        '';
    }
  };
  target.addEventListener('input', handler);
  handler();
});
