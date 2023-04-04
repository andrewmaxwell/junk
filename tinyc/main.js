import {tokenize} from './tokenize.js';
import {parse} from './parse.js';
import {toAsm} from './toAsm.js';
import {runAsm} from './runAsm.js';
import {tests} from './tests.js';

document.querySelector('.examples').innerHTML = tests
  .map(
    (t, i) => `
  <div class="container" id="test${i}">
    <div class="item">
      <label>Input</label>
      <textarea></textarea>
    </div>
    <div class="item">
      <span class="arrow">➡️</span>
      <label>Tokens</label>
      <pre class="tokens"></pre>
    </div>
    <div class="item">
      <span class="arrow">➡️</span>
      <label>Syntax Tree</label>
      <pre class="ast"></pre>
    </div>
    <div class="item">
      <span class="arrow">➡️</span>
      <label>Assembly</label>
      <pre class="asm"></pre>
    </div>
    <div class="item">
      <span class="arrow">➡️</span>
      <label>Result</label>
      <pre class="result"></pre>
    </div>
  </div>
`
  )
  .join('');

tests.forEach((t, i) => {
  const row = document.querySelector(`#test${i}`);
  const textarea = row.querySelector('textarea');
  const tokensPre = row.querySelector('.tokens');
  const astPre = row.querySelector('.ast');
  const asmPre = row.querySelector('.asm');
  const resultPre = row.querySelector('.result');
  const update = () => {
    try {
      tokensPre.innerHTML = astPre.innerHTML = asmPre.innerHTML = '';

      const tokens = tokenize(textarea.value);
      tokensPre.innerText = JSON.stringify(tokens, null, 2);

      const ast = parse(tokens);
      astPre.innerText = JSON.stringify(ast, null, 2);

      const asm = toAsm(ast);
      asmPre.innerHTML = asm
        .map((x, i) => `<span class="lineNum">${i + 1}</span>${x}`)
        .join('\n');

      const result = runAsm(asm);
      resultPre.innerText = Object.entries(result)
        .map((p) => p.join(' = '))
        .sort()
        .join('\n');
    } catch (e) {
      resultPre.innerText = e.stack;
      console.error(e);
    }
  };

  textarea.addEventListener('input', update);
  textarea.value = t.input;
  update();
});

document.querySelectorAll('code[id]').forEach(async (el) => {
  el.innerHTML = window.hljs.highlight(
    await (await fetch(el.id + '.js')).text(),
    {language: 'javascript'}
  ).value;
});
