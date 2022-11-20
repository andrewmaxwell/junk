import loadModule from './sim.mjs';

const getVarsFromCode = async () => {
  const response = await fetch('./sim.c');
  const code = await response.text();
  const vars = {};
  for (const [, key, val] of code.matchAll(/#define (\w+) ([\d.-]+)\n/g)) {
    vars[key] = +val;
  }
  return vars;
};

const [module, {width, height, numParticles, numColors}] = await Promise.all([
  loadModule(),
  getVarsFromCode(),
]);
console.log(module);
const {asm, _init, _getX, _getY, _getPrevX, _getPrevY, _iterate, _moveMouse} =
  module;

_init();

const xCoord = new Float32Array(asm.d.buffer, _getX(), numParticles);
const yCoord = new Float32Array(asm.d.buffer, _getY(), numParticles);
const xPrev = new Float32Array(asm.d.buffer, _getPrevX(), numParticles);
const yPrev = new Float32Array(asm.d.buffer, _getPrevY(), numParticles);

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
canvas.width = width;
canvas.height = height;
ctx.lineWidth = 2;
ctx.lineCap = 'round';

let total = 0;
let frame = 0;

const loop = () => {
  const start = performance.now();
  _iterate();

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  for (let i = 0; i < numColors; i++) {
    ctx.strokeStyle = `hsl(${(i / numColors + 0.1) * 360},100%,80%)`;
    ctx.beginPath();
    for (var j = i; j < numParticles; j += numColors) {
      ctx.moveTo(xCoord[j], yCoord[j]);
      ctx.lineTo(xPrev[j], yPrev[j]);
    }
    ctx.stroke();
  }

  const end = performance.now() - start;
  total += end;
  ctx.fillStyle = 'white';
  ctx.fillText(Math.round(total / ++frame), 3, 10);
  requestAnimationFrame(loop);
};

loop();

canvas.addEventListener('mousemove', (e) => {
  _moveMouse(e.offsetX, e.offsetY, e.movementX, e.movementY);
});
