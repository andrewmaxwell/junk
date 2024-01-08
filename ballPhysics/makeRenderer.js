export const makeRenderer = () => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.globalCompositeOperation = 'screen';

  return (balls, lines) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (let i = 0; i < balls.length; i++) {
      const {x, y, rad} = balls[i];
      ctx.fillStyle = `hsl(${i}, 100%, 20%)`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.fillStyle = '#222';
    ctx.beginPath();
    for (const {x1, y1, x2, y2} of lines) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.lineTo(innerWidth, innerHeight);
    ctx.lineTo(0, innerHeight);
    ctx.lineTo(0, 0);
    ctx.fill();
  };
};
