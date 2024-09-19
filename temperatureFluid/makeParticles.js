export const makeParticles = (fluidCanvas, getCellIndex) => {
  const particles = [];
  for (let i = 0; i < 1000; i++) {
    particles[i] = {x: Math.random(), y: Math.random()};
  }

  const particleCanvas = document.querySelector('#particleCanvas');
  const ctx = particleCanvas.getContext('2d');
  let canvasWidth, canvasHeight;

  const resize = () => {
    canvasWidth = particleCanvas.width = fluidCanvas.clientWidth;
    canvasHeight = particleCanvas.height = fluidCanvas.clientHeight;
  };
  window.addEventListener('resize', resize);
  resize();

  return (xVelPrev, yVelPrev, dt) => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = 'white';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const p of particles) {
      ctx.moveTo(p.x * canvasWidth, p.y * canvasHeight);
      const index = getCellIndex(p);
      p.x += xVelPrev[index] / dt;
      p.y += yVelPrev[index] / dt;
      ctx.lineTo(p.x * canvasWidth, p.y * canvasHeight);
    }
    ctx.stroke();
  };
};
