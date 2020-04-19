const params = {
  rows: 16,
  height: 3,
  speed: 0.0001,
  baseSpeed: 0.01,
  magnitude: 2,
};

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const sprite = document.createElement('canvas');

const getSize = () =>
  Math.min(
    (innerWidth / params.rows) * (2 / 3),
    innerHeight / params.rows / (0.75 + 5 / params.rows)
  );

let frame = 0;

const makeSprite = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;

  const {height} = params;
  const sp = sprite.getContext('2d');
  const size = getSize();
  sprite.width = sprite.height = size * (1 + height);
  sp.lineWidth = 0.5 / size;

  sp.scale(size, size);
  sp.fillStyle = '#FFF';
  sp.beginPath();
  sp.moveTo(1, 0);
  sp.lineTo(1 + height, height);
  sp.lineTo(1 + height, 1 + height);
  sp.lineTo(1, 1);
  sp.fill();
  sp.stroke();

  sp.fillStyle = '#444';
  sp.beginPath();
  sp.moveTo(1, 1);
  sp.lineTo(1 + height, 1 + height);
  sp.lineTo(height, 1 + height);
  sp.lineTo(0, 1);
  sp.fill();
  sp.stroke();

  sp.fillStyle = '#CCC';
  sp.beginPath();
  sp.rect(0, 0, 1, 1);
  sp.fill();
  sp.stroke();
};

const loop = () => {
  const {rows, speed, baseSpeed, magnitude} = params;

  const size = getSize();

  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.save();
  ctx.translate(innerWidth / 2, (size / 2) * (magnitude + 1));
  ctx.scale(1, 0.5);
  ctx.rotate(Math.PI / 4);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < rows; x++) {
      const z =
        Math.sin(frame * ((y * rows + x) * speed + baseSpeed)) * magnitude;
      ctx.drawImage(sprite, size * (x + z), size * (y + z));
    }
  }
  ctx.restore();

  frame++;
  requestAnimationFrame(loop);
};

const gui = new window.dat.GUI();
gui.add(params, 'rows', 1, 100).step(1).onChange(makeSprite);
gui.add(params, 'height', 0, 10).onChange(makeSprite);
gui.add(params, 'baseSpeed', 0, 0.1);
gui.add(params, 'speed', 0, 0.001);
gui.add(params, 'magnitude', 0, 10);

window.addEventListener('resize', makeSprite);

makeSprite();
loop();
