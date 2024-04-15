const scale = 0.25;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });

// takes a function and runs it enough times to maintain about 60fps
const autoSpeed = (func, speed = 1, targetMsPerFrame = 16.667) => {
  setInterval(() => {
    console.log(`${speed.toLocaleString()} iterations per frame`);
  }, 1000);
  return (...args) => {
    const start = performance.now();
    for (let s = 0; s < speed; s++) func(...args);
    speed *= performance.now() - start < targetMsPerFrame ? 1.1 : 0.9;
  };
};

// returns difference between two pixels
const compare = ({data, width}, x1, y1, x2, y2) => {
  const k1 = 4 * (y1 * width + x1);
  const k2 = 4 * (y2 * width + x2);
  return Math.hypot(
    data[k1 + 0] - data[k2 + 0], // red
    data[k1 + 1] - data[k2 + 1], // green
    data[k1 + 2] - data[k2 + 2] // blue
  );
};

// swaps two pixels
const swap = ({data, width}, x1, y1, x2, y2) => {
  const k1 = 4 * (y1 * width + x1);
  const k2 = 4 * (y2 * width + x2);
  for (let i = 0; i < 3; i++) {
    const t = data[k1 + i];
    data[k1 + i] = data[k2 + i];
    data[k2 + i] = t;
  }
};

const randomSwapVertical = (imgData) => {
  const {width, height} = imgData;
  const x = Math.floor(Math.random() * width);
  const y = Math.floor(Math.random() * (height - 1));
  let cost = 0;
  if (y > 0) {
    cost +=
      compare(imgData, x, y + 1, x, y - 1) - compare(imgData, x, y, x, y - 1); // up
  }
  if (y < height - 2) {
    cost +=
      compare(imgData, x, y, x, y + 2) - compare(imgData, x, y + 1, x, y + 2); // down
  }
  if (x > 0) {
    cost +=
      compare(imgData, x, y + 1, x - 1, y) - // up left
      compare(imgData, x, y, x - 1, y) + // up left
      compare(imgData, x, y, x - 1, y + 1) - // down left
      compare(imgData, x, y + 1, x - 1, y + 1); // down left
  }
  if (x < width - 1) {
    cost +=
      compare(imgData, x, y + 1, x + 1, y) - // up right
      compare(imgData, x, y, x + 1, y) + // up right
      compare(imgData, x, y, x + 1, y + 1) - // down right
      compare(imgData, x, y + 1, x + 1, y + 1); // down right
  }

  if (cost < 0) swap(imgData, x, y, x, y + 1);
};

const randomSwapHorizontal = (imgData) => {
  const {width, height} = imgData;
  const x = Math.floor(Math.random() * (width - 1));
  const y = Math.floor(Math.random() * height);

  let cost = 0;
  if (x > 0) {
    cost +=
      compare(imgData, x + 1, y, x - 1, y) - compare(imgData, x, y, x - 1, y); // left
  }
  if (x < width - 2) {
    cost +=
      compare(imgData, x, y, x + 2, y) - compare(imgData, x + 1, y, x + 2, y); // right
  }
  if (y > 0) {
    cost +=
      compare(imgData, x + 1, y, x, y - 1) - // up left
      compare(imgData, x, y, x, y - 1) + // up left
      compare(imgData, x, y, x + 1, y - 1) - // up right
      compare(imgData, x + 1, y, x + 1, y - 1); // up right
  }
  if (y < height - 1) {
    cost +=
      compare(imgData, x + 1, y, x, y + 1) - // down left
      compare(imgData, x, y, x, y + 1) + // down left
      compare(imgData, x, y, x + 1, y + 1) - // down right
      compare(imgData, x + 1, y, x + 1, y + 1); // down right
  }

  if (cost > 0) swap(imgData, x, y, x + 1, y);
};

const img = await loadImage('../genesis/3.webp');

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
canvas.width = Math.floor(img.width * scale);
canvas.height = Math.floor(img.height * scale);

ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

const doManySwaps = autoSpeed(() => {
  randomSwapHorizontal(imgData);
  randomSwapVertical(imgData);
}, 1000);

const loop = () => {
  doManySwaps();
  ctx.putImageData(imgData, 0, 0);
  requestAnimationFrame(loop);
};
loop();
