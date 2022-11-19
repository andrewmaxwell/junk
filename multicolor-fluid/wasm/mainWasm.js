const getVarsFromCode = async () => {
  const response = await fetch('./sim.c');
  const code = await response.text();
  const vars = Object.fromEntries(
    [...code.matchAll(/#define (\w+) ([\d.-]+)\n/g)].map(([, key, val]) => [
      key,
      +val,
    ])
  );

  return {vars};
};

window.Module.onRuntimeInitialized = async () => {
  const {wasmMemory, _init, _getX, _getY, _getPrevX, _getPrevY, _iterate} =
    window;

  _init();

  const {
    vars: {width, height, numParticles, numColors},
  } = await getVarsFromCode();

  const xCoord = new Float32Array(wasmMemory.buffer, _getX(), numParticles);
  const yCoord = new Float32Array(wasmMemory.buffer, _getY(), numParticles);
  const xPrev = new Float32Array(wasmMemory.buffer, _getPrevX(), numParticles);
  const yPrev = new Float32Array(wasmMemory.buffer, _getPrevY(), numParticles);

  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  let totalTime = 0;
  let frame = 0;
  const loop = () => {
    const start = performance.now();
    _iterate();
    totalTime += performance.now() - start;

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

    const time = Math.round(totalTime / ++frame);
    ctx.fillStyle = 'white';
    ctx.fillText(time, 3, 10);
    requestAnimationFrame(loop);
  };

  loop();
};
