const {Module} = window;

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

Module.onRuntimeInitialized = async () => {
  Module.ccall('init');

  const {
    vars: {width, height, numParticles, numColors},
  } = await getVarsFromCode();

  const {wasmMemory, _getX, _getY, _getPrevX, _getPrevY, _iterate} = window;
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
  const loop = () => {
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
    requestAnimationFrame(loop);
  };

  loop();
  // const {_iterate} = window;
  // console.log('iterate!!!', _iterate());
};

// const memory = new WebAssembly.Memory({initial: 10, maximum: 100});

// const importObject = {
//   // imports: {imported_func: (arg) => console.log(arg)},
//   js: {mem: memory},
// };
// WebAssembly.instantiateStreaming(fetch('sim.wasm'), importObject).then(
//   (obj) => {
//     // obj.instance.exports.exported_func()
//     console.log(obj, memory);
//   }
// );
