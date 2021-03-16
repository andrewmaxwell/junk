const justify = (str, len) => {
  if (str.length <= len) return str;

  const words = str.split(' ');
  let count = 0;
  while (words.slice(0, count).join(' ').length <= len) count++;
  count--;

  let line = words[0];
  let spaceNeeded =
    len - words.slice(0, count).reduce((sum, word) => sum + word.length, 0);
  for (let i = 1; i < count; i++) {
    const numSpaces = Math.ceil(spaceNeeded / (count - i));
    line += ' '.repeat(numSpaces) + words[i];
    spaceNeeded -= numSpaces;
  }

  return line + '\n' + justify(words.slice(count).join(' '), len);
};

const {Test} = require('./test');

const text = `Lorem  ipsum  dolor  sit amet,
consectetur  adipiscing  elit.
Vestibulum    sagittis   dolor
mauris,  at  elementum  ligula
tempor  eget.  In quis rhoncus
nunc,  at  aliquet orci. Fusce
at   dolor   sit   amet  felis
suscipit   tristique.   Nam  a
imperdiet   tellus.  Nulla  eu
vestibulum    urna.    Vivamus
tincidunt  suscipit  enim, nec
ultrices   nisi  volutpat  ac.
Maecenas   sit   amet  lacinia
arcu,  non dictum justo. Donec
sed  quam  vel  risus faucibus
euismod.  Suspendisse  rhoncus
rhoncus  felis  at  fermentum.
Donec lorem magna, ultricies a
nunc    sit    amet,   blandit
fringilla  nunc. In vestibulum
velit    ac    felis   rhoncus
pellentesque. Mauris at tellus
enim.  Aliquam eleifend tempus
dapibus. Pellentesque commodo,
nisi    sit   amet   hendrerit
fringilla,   ante  odio  porta
lacus,   ut   elementum  justo
nulla et dolor.`;
const result = justify(text.replace(/\s+/g, ' '), 30);
console.log(result);
Test.assertDeepEquals(result, text);
