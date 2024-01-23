const xSpacing = 50;
const ySpacing = 50;
const lineWidth = 16;

const toX = (j) => 100 + j * xSpacing;
const toY = (i) => 30 + i * ySpacing;

export const draw = ({people, attendance}) => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = toX(people.length);
  canvas.height = toY(attendance.length);

  // alternating background row colors
  ctx.fillStyle = '#00000010';
  for (let i = 1; i < attendance.length; i += 2) {
    ctx.fillRect(0, toY(i - 0.5), canvas.width, ySpacing);
  }

  ctx.fillStyle = 'black';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // left column dates
  for (let i = 0; i < attendance.length; i++) {
    ctx.fillText(attendance[i].date.toISOString().slice(0, 10), 3, toY(i));
  }

  // top and bottom row numbers
  ctx.textAlign = 'center';
  for (let i = 0; i < people.length; i++) {
    ctx.fillText(i + 1, toX(i), 10);
    ctx.fillText(i + 1, toX(i), canvas.height - 5);
  }

  // color lines
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = ctx.lineCap = 'round';
  people.forEach(({positions}, i) => {
    ctx.strokeStyle = `hsla(${(i / people.length) * 360}, 100%, 80%, 50%)`;
    ctx.beginPath();
    for (const {x, y} of positions) ctx.lineTo(toX(x), toY(y));
    ctx.stroke();
  });

  // people names
  ctx.fillStyle = 'black';
  people.forEach(({name, positions}) => {
    for (const {x, y, present} of positions) {
      ctx.globalAlpha = present ? 1 : 0.33;
      ctx.fillText(name, toX(x), toY(y));
    }
  });
};
