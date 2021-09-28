const compress = (s) => {
  const dict = {};
  const data = s.split('');
  const out = [];
  let phrase = data[0];
  for (let i = 1; i < data.length; i++) {
    const currChar = data[i];
    if (dict[phrase + currChar]) phrase += currChar;
    else {
      out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
      dict[phrase + currChar] = 255 + out.length;
      phrase = currChar;
    }
  }
  out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
  return out.map((o) => String.fromCharCode(o)).join('');
};

const decompress = (s) => {
  const dict = {};
  const data = s.split('');
  const out = [data[0]];
  let code = 256;

  let currChar = data[0];
  let oldPhrase = data[0];
  for (let i = 1; i < data.length; i++) {
    const currCode = data[i].charCodeAt(0);
    const phrase =
      currCode < 256 ? data[i] : dict[currCode] || oldPhrase + currChar;
    out.push(phrase);
    currChar = phrase.charAt(0);
    dict[code] = oldPhrase + currChar;
    code++;
    oldPhrase = phrase;
  }
  return out.join('');
};

const data = require('fs').readFileSync('./data.txt', 'utf-8');
const compressed = compress(data);
console.log(
  decompress(compressed) === data &&
    `${compressed.length} / ${data.length} = ${compressed.length / data.length}`
);
