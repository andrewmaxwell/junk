const drawScale = 50;
const circleRad = 2 / drawScale;

export const makeRenderer = ({width, height, centers}) => {
  const canvas = document.createElement('canvas');
  canvas.width = width * drawScale;
  canvas.height = height * drawScale;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');

  const render = (grid) => {
    ctx.scale(drawScale, drawScale);
    grid.forEach((row, y) => {
      row.forEach((val, x) => {
        if (val < 0) return;
        ctx.fillStyle = `hsl(${(val / centers.length) * 360}, 100%, 80%)`;
        ctx.fillRect(x, y, 1, 1);
      });
    });

    ctx.fillStyle = 'black';
    for (const {x, y} of centers) {
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, circleRad, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  return {render};
};
