import {parse, parseGrammar} from './parse.js';

self.addEventListener('message', ({data: {grammarStr, code}}) => {
  let time, parsed;
  try {
    const grammar = parseGrammar(grammarStr);
    const start = performance.now();
    parsed = parse(code, grammar);
    time = performance.now() - start;
  } catch (e) {
    console.error(e);
    parsed = {error: e.message};
  }
  self.postMessage({parsed, time});
});
