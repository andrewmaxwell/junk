export const makeParticles = (fluidCanvas, getVel) => {
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

  const iterate = () => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = 'white';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const p of particles) {
      ctx.moveTo(p.x * canvasWidth, p.y * canvasHeight);
      const vel = getVel(p.x, p.y);
      p.x = Math.max(0, Math.min(1, p.x + vel.x));
      p.y = Math.max(0, Math.min(1, p.y + vel.y));
      ctx.lineTo(p.x * canvasWidth, p.y * canvasHeight);
    }
    ctx.stroke();

    // replace randomly
    const p = particles[Math.floor(Math.random() * particles.length)];
    p.x = Math.random();
    p.y = Math.random();
  };

  return {iterate};
};
