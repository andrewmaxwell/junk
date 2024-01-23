import {shuffle} from '../carcassonne/utils.js';
import {bubbleSort} from './bubbleSort.js';
import {quickSort} from './quickSort.js';

const canvas = document.querySelector('canvas');
const leftMargin = 32;

const ctx = canvas.getContext('2d');
function draw({type, a, b, arr}, time) {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const elHeight = innerHeight / arr.length;

  if (type === 'compare') {
    for (let i = 0; i < arr.length; i++) {
      ctx.fillStyle = `hsl(${(arr[i] / arr.length) * 360},100%,50%)`;
      ctx.fillRect(leftMargin, i * elHeight, 300, elHeight);
    }
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 5;
    ctx.strokeRect(leftMargin, a * elHeight, 300, elHeight);
    ctx.strokeRect(leftMargin, b * elHeight, 300, elHeight);
  } else {
    for (let i = 0; i < arr.length; i++) {
      ctx.fillStyle = `hsl(${(arr[i] / arr.length) * 360},100%,50%)`;
      const x =
        i === a
          ? 1 + 4 * (time * time - time)
          : i === b
          ? 1 - 4 * (time * time - time)
          : 1;
      const y =
        i === a
          ? b * time + a * (1 - time)
          : i === b
          ? a * time + b * (1 - time)
          : i;
      ctx.fillRect(x * leftMargin, y * elHeight, 300, elHeight);
    }
  }
}

const framesPerStep = 20;
const arr = shuffle(Array.from({length: 32}, (_, i) => i));
const steps = quickSort(arr);

let frame = 0;
function loop() {
  const stepIndex = Math.floor(frame / framesPerStep);
  if (!steps[stepIndex]) return;

  draw(steps[stepIndex], (frame / framesPerStep) % 1);

  frame++;
  requestAnimationFrame(loop);
}

loop();
