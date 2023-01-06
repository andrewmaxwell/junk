import {execute} from './execute.js';
import {preprocess} from './preprocess.js';

const asmInput = document.querySelector('#asm');
const outputPre = document.querySelector('#output');

const run = () => {
  console.clear();
  try {
    const instructions = preprocess(asmInput.value);
    document.querySelector('#preprocessed').innerText = instructions
      .map((line) => line.join(' '))
      .join('\n');

    const output = execute(instructions);
    outputPre.innerText = output;
  } catch (e) {
    console.error(e);
    outputPre.innerText = e.message;
  }
};

asmInput.addEventListener('input', run);
run();
