const rayHeight = 100;

export const makeRenderer = ({width, height, carRadius, maxFrames}) => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height + rayHeight;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  return ({car, obstacles, goal, rays, frame}) => {
    ctx.clearRect(0, 0, width, canvas.height);

    // obstacles
    ctx.fillStyle = '#CCC';
    for (const {x, y, rad} of obstacles) {
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 2 * Math.PI);
      ctx.fill();
    }

    // goal
    ctx.fillStyle = 'green';
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, carRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = '12px sans-serif';
    ctx.fillText('goal', goal.x, goal.y);

    // car
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.scale(carRadius, carRadius);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.lineTo(1, 0);
    ctx.lineTo(-0.5, 0.5);
    ctx.lineTo(-0.5, -0.5);
    ctx.fill();

    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1 / carRadius;
    ctx.strokeStyle = 'cyan';
    for (const {angle, dist} of rays) {
      const cos = Math.cos(angle - car.angle);
      const sin = Math.sin(angle - car.angle);
      const len = dist / carRadius;
      ctx.moveTo(cos, sin);
      ctx.lineTo(len * cos, len * sin);
    }
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.fillRect(0, height, width, rayHeight);
    ctx.fillStyle = 'black';
    for (let i = 0; i < rays.length; i++) {
      ctx.globalAlpha = Math.max(0, Math.min(1, rays[i].dist / 300));
      ctx.fillRect(
        (i / rays.length) * width,
        height,
        width / rays.length,
        rayHeight
      );
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'green';
    ctx.fillRect(0, height, width * (frame / maxFrames), 4);
  };
};
