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
      <span class="arrow">→</span>
      <label>Tokens</label>
      <pre class="tokens"></pre>
    </div>
    <div class="item">
      <span class="arrow">→</span>
      <label>Syntax Tree</label>
      <pre class="ast"></pre>
    </div>
    <div class="item">
      <span class="arrow">→</span>
      <label>Assembly</label>
      <pre class="asm"></pre>
    </div>
    <div class="item">
      <span class="arrow">→</span>
      <label>Result</label>
      <pre class="result"></pre>
    </div>
  </div>
`
  )
  .join('');

const highlight = (code) =>
  window.hljs.highlight(code, {language: 'javascript'}).value;

tests.forEach((t, i) => {
  const row = document.querySelector(`#test${i}`);
  const textarea = row.querySelector('textarea');
  const tokensPre = row.querySelector('.tokens');
  const astPre = row.querySelector('.ast');
  const asmPre = row.querySelector('.asm');
  const resultPre = row.querySelector('.result');
  const update = () => {
    tokensPre.innerHTML =
      astPre.innerHTML =
      asmPre.innerHTML =
      resultPre.innerHTML =
        '';

    let tokens, ast, asm;
    try {
      tokens = tokenize(textarea.value);
      tokensPre.innerHTML = highlight(JSON.stringify(tokens, null, 2));
    } catch (e) {
      tokensPre.innerText = e.stack;
      return;
    }

    try {
      ast = parse(tokens);
      astPre.innerHTML = highlight(JSON.stringify(ast, null, 2));
    } catch (e) {
      astPre.innerText = e.stack;
      return;
    }

    try {
      asm = toAsm(ast);
      asmPre.innerHTML = highlight(JSON.stringify(asm, null, 2));
    } catch (e) {
      asmPre.innerText = e.stack;
      return;
    }

    try {
      resultPre.innerText = runAsm(asm);
    } catch (e) {
      resultPre.innerText = e.stack;
    }
  };

  textarea.addEventListener('input', update);
  textarea.value = t.input;
  update();
});

document.querySelectorAll('code[id]').forEach(async (el) => {
  el.innerHTML = highlight(await (await fetch(el.id + '.js')).text());
});
