const xSpacing = 50;
const ySpacing = 20;
const lineWidth = 16;

const toX = (j) => 30 + j * xSpacing;
const toY = (i) => 30 + i * ySpacing;

/**
 * @typedef {{
 *  id: number,
 *  name: string
 *  score: number
 *  positions: Array<{
 *    x: number,
 *    y: number,
 *    present: boolean
 *  }>,
 *  last: number
 * }} Person
 *
 * @typedef {{ids: string, date: Date}} Week
 *
 * @param {{
 *  people: Array<Person>,
 *  attendance: Array<Week>
 * }} config */
export const draw = ({people, attendance}) => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  canvas.width = toX(attendance.length) + 10;
  canvas.height = toY(
    Math.max(...people.flatMap((p) => p.positions.map((p) => p.y))) + 1,
  );

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // top dates
  for (let i = 0; i < attendance.length; i++) {
    ctx.fillText(
      attendance[i].date.toISOString().slice(0, 10),
      toX(i),
      i % 2 ? 5 : 15,
    );
  }

  // right row numbers
  for (let i = 0; i < people.length; i++) {
    ctx.fillText(String(i + 1), canvas.width - 10, toY(i));
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
