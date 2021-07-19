const colors = [
  'black',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
];

const makeSpan = (row, counter) => (color, col) =>
  `<span style="color:${color}">${
    (col - row + 8) % 8 === counter % 8 ? '*' : '@'
  }</span>`;

const makeRow = (row, counter) =>
  `<div>${colors.map(makeSpan(row, counter)).join('')}</div>`;

let counter = 0;

const draw = () => {
  document.querySelector('#flag').innerHTML = colors
    .map((_, row) => makeRow(row, counter))
    .join('');

  counter++;
  setTimeout(draw, 500);
};

draw();
