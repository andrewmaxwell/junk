const canvas = document.querySelector('canvas');
const W = (canvas.width = innerWidth);
const H = (canvas.height = innerHeight);
const T = canvas.getContext('2d');

T.lineWidth = 0.25;
T.strokeStyle = 'white';
T.fillStyle = 'rgba(0,0,0,0.03125)';

let bikes = [];
let frame = 0;

const isLiving = (b) => Math.abs(b.aa) < 0.2;

const loop = () => {
  bikes.push({x: 0, y: H / 2, a: 0, aa: 0, aaa: 0, aaaa: 0});

  if (frame % 32 === 0) {
    T.fillRect(0, 0, W, H);
    bikes = bikes.filter(isLiving);
  }

  T.beginPath();

  for (let i = 0; i < 10; i++) {
    for (const b of bikes) {
      if (!isLiving(b)) continue;
      T.moveTo(b.x, b.y);

      b.x += Math.cos(b.a);
      b.y += Math.sin(b.a);
      b.a += b.aa;
      b.aa += b.aaa;
      b.aaa += b.aaaa;
      b.aaaa += (Math.random() - 0.5) / 1e8;

      T.lineTo(b.x, b.y);
    }
  }

  T.stroke();
  frame++;

  requestAnimationFrame(loop);
};

loop();
