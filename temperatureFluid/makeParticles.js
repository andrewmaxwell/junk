const particleCount = 1000;

/** @type {(fluidCanvas: HTMLCanvasElement, particleCanvas: HTMLCanvasElement, getVel: (x: number, y: number) => {x: number, y: number}) => {iterate: () => void}} */
export const makeParticles = (fluidCanvas, particleCanvas, getVel) => {
  const respawn = (p) => {
    p.x = Math.random();
    p.y = Math.random();
  };

  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles[i] = {x: 0, y: 0};
    respawn(particles[i]);
  }

  const ctx = particleCanvas.getContext('2d');
  if (!ctx) throw new Error('no context');
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
      const fromX = p.x * canvasWidth;
      const fromY = p.y * canvasHeight;
      const vel = getVel(p.x, p.y);
      p.x += vel.x;
      p.y += vel.y;

      // Respawn rather than clamp: a clamped particle pins itself to the wall
      // for the rest of its life. The negated test also catches NaN. Skip this
      // frame's segment so the respawn doesn't streak across the canvas.
      if (!(p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1)) {
        respawn(p);
        continue;
      }

      ctx.moveTo(fromX, fromY);
      ctx.lineTo(p.x * canvasWidth, p.y * canvasHeight);
    }
    ctx.stroke();

    // Keep recycling so the field doesn't settle into only long-lived paths.
    respawn(particles[Math.floor(Math.random() * particles.length)]);
  };

  return {iterate};
};
