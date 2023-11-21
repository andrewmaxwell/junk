import {loadSound} from './loadSound.js';

const speedMult = 1 + 1 / 128;
const startSpeed = 8;
const numBalls = 4;
const rad = 4;
const startPitch = 0.05;
const bounceRandomness = 1;

let sound;

const balls = Array.from({length: numBalls}, (_, i) => ({
  x: rad + Math.random() * (innerWidth - 2 * rad),
  y: rad + Math.random() * (innerHeight - 2 * rad),
  xs: startSpeed * Math.cos(i),
  ys: startSpeed * Math.sin(i),
  rad,
  pitch: startPitch,
}));

const onBounce = (ball) => {
  sound.play(ball.pitch);
  ball.xs *= speedMult;
  ball.ys *= speedMult;
  ball.pitch *= speedMult;

  const angle = Math.random() * 2 * Math.PI;
  ball.xs += bounceRandomness * Math.cos(angle);
  ball.ys += bounceRandomness * Math.sin(angle);
};

const canvas = document.querySelector('canvas');
canvas.width = innerWidth;
canvas.height = innerHeight;

const loop = () => {
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  for (const ball of balls) {
    ctx.strokeStyle = `hsl(${ball.pitch * 360},100%,50%)`;
    ctx.lineWidth = ball.rad * 2;
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);

    ball.x += ball.xs;
    ball.y += ball.ys;
    if (ball.x + ball.rad > innerWidth) {
      ball.xs *= -1;
      ball.x = 2 * innerWidth - ball.x - 2 * ball.rad;
      onBounce(ball);
    } else if (ball.x - ball.rad < 0) {
      ball.xs *= -1;
      ball.x = 2 * ball.rad - ball.x;
      onBounce(ball);
    }

    if (ball.y + ball.rad > innerHeight) {
      ball.ys *= -1;
      ball.y = 2 * innerHeight - ball.y - 2 * ball.rad;
      onBounce(ball);
    } else if (ball.y - ball.rad < 0) {
      ball.ys *= -1;
      ball.y = 2 * ball.rad - ball.y;
      onBounce(ball);
    }

    ctx.lineTo(ball.x, ball.y);
    ctx.stroke();
  }

  requestAnimationFrame(loop);
};

window.onclick = async () => {
  document.querySelector('h1').remove();
  window.onclick = null;
  sound = await loadSound('ding.mp3');
  loop();
};
