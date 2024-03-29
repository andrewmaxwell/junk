import {tests} from './tests.js';

document.querySelector('#root').innerHTML = tests
  .map(
    ([input, , desc = '']) => `
    <div class="container">
      <p>${desc}</p>
      <textarea>${input.trim()}</textarea>
      <div class="result"></div>
      <div class="time"></div>
    </div>`
  )
  .join('<hr />');

document.querySelectorAll('textarea').forEach((target) => {
  // evaluate in web workers so if any of them are really slow or crash it doesn't break the whole page hopefully
  const worker = new Worker('worker.js', {type: 'module'});
  worker.addEventListener('message', ({data: {result, time}}) => {
    target.nextElementSibling.innerHTML = `<span>${result}</span>`;
    target.nextElementSibling.nextElementSibling.innerHTML = time;
  });
  const handler = () => {
    if (target.value) {
      target.style.height = '1px';
      target.style.height = target.scrollHeight + 'px';
      worker.postMessage(target.value);
    } else {
      target.nextElementSibling.innerHTML = '';
      target.nextElementSibling.nextElementSibling.innerHTML = '';
    }
  };
  target.addEventListener('input', handler);
  handler();
});
