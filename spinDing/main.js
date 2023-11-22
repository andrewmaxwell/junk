import {loadSound} from '../bounceDing/loadSound.js';

const numBalls = 128;
const pitchMult = 1 + 1 / 128;
const speed = 1 / 4096;
const rad = 8;

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

let sound;

let frame = 1;

const getDist = (i) =>
  (((i + 1) / (numBalls + 1)) * Math.min(innerWidth, innerHeight)) / 2;
const getAngle = (frame, i) => frame * (i + 1) * speed;

const loop = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.translate(innerWidth / 2, innerHeight / 2);

  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();

  for (let i = 0; i < numBalls; i++) {
    const dist = getDist(i);
    const angle = getAngle(frame, i);
    const prevAngle = getAngle(frame - 1, i);
    if (
      Math.floor(angle / Math.PI / 2) !== Math.floor(prevAngle / Math.PI / 2)
    ) {
      sound.play(2 - pitchMult ** i);
    }
    ctx.lineTo(dist * Math.cos(angle), dist * Math.sin(angle));
  }

  ctx.stroke();

  for (let i = 0; i < numBalls; i++) {
    const dist = getDist(i);
    const angle = getAngle(frame, i);
    ctx.fillStyle = `hsl(${(i / numBalls) * 360}, 100%, 50%)`;
    ctx.beginPath();
    ctx.arc(
      dist * Math.cos(angle),
      dist * Math.sin(angle),
      rad,
      0,
      2 * Math.PI
    );
    ctx.fill();
  }

  // ctx.strokeStyle = 'white';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(innerWidth, 0);
  ctx.stroke();

  frame++;
  requestAnimationFrame(loop);
};

canvas.width = innerWidth;
canvas.height = innerHeight;
ctx.fillStyle = 'white';
ctx.font = '50px sans-serif';
ctx.fillText('click or tap to start', 30, 60);

const start = async () => {
  document.removeEventListener('click', start);
  document.removeEventListener('touchend', start);
  sound = await loadSound('../bounceDing/ding.mp3');
  loop();
};

document.addEventListener('click', start);
document.addEventListener('touchend', start);
