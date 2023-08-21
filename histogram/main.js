const imgSrc = './waterfall.jpeg';
// const imgSrc = './vivid.jpg';
const moveSpeed = 0.1;
const leftToRightSpeed = 200;
const width = 400;
const mousePower = 1000;

const toLum = (r, g, b) => (0.2989 * r + 0.587 * g + 0.114 * b) / 255;

function toHue(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h;

  if (diff === 0) h = 0;
  else if (max === r) h = ((g - b) / diff) % 6;
  else if (max === g) h = (b - r) / diff + 2;
  else h = (r - g) / diff + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  return h;
}

const toHex = (r, g, b) =>
  '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

const toPixels = (img) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  const height = (canvas.height = Math.floor((width / img.width) * img.height));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);

  const buckets = {};
  const numBuckets = innerWidth;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4;
      const r = imgData.data[k];
      const g = imgData.data[k + 1];
      const b = imgData.data[k + 2];
      const lum = toLum(r, g, b);
      const tx = Math.floor(lum * numBuckets);

      (buckets[tx] = buckets[tx] || []).push({
        x: (x / width) * innerWidth,
        y: (y / height) * innerHeight,
        tx,
        hue: toHue(r, g, b),
        color: toHex(r, g, b),
      });
    }
  }

  for (let key in buckets) {
    buckets[key]
      .sort((a, b) => a.hue - b.hue)
      .forEach((b, i, arr) => {
        b.ty = innerHeight / 2 - arr.length / 2 + i;
      });
  }

  return Object.values(buckets).reverse().flat();
};

const getImg = (imgSrc) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = imgSrc;
  });

let mouse = {x: 0, y: 0};
const main = async () => {
  const canvas = document.querySelector('canvas');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');
  const pixels = toPixels(await getImg(imgSrc));
  let frame = 0;

  const loop = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x - 1, p.y - 1);
      if (pixels.length - i < frame * leftToRightSpeed) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const amt = mousePower * Math.min(0.5, 1 / (dx * dx + dy * dy));
        p.x += (p.tx - p.x) * moveSpeed - dx * amt;
        p.y += (p.ty - p.y) * moveSpeed - dy * amt;
      }
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    frame++;
    requestAnimationFrame(loop);
  };

  loop();
};

main();

window.addEventListener('mousemove', (e) => {
  mouse.x = e.pageX;
  mouse.y = e.pageY;
});
