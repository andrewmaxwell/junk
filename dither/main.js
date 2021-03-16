const canvas = document.querySelector('canvas');
const img = new Image();

let W, H, ctx;

const res = 2;
const params = {
  red: 0.2126,
  green: 0.7152,
  blue: 0.0722,
  right: 7 / 16,
  downLeft: 3 / 16,
  down: 5 / 16,
  downRight: 1 / 16,
  dither: 1,
};

// const getPalette = (data, num, iterations = 4) => {
//   const p = [];
//   for (let i = 0; i < num; i++) {
//     const v = (i / (num - 1)) * 255;
//     p[i] = {
//       color: new Uint8Array([v, v, v]),
//       vals: new Uint32Array(3),
//       count: 0,
//     };
//   }
//   for (let s = 0; s < iterations; s++) {
//     for (let i = 0; i < data.length; i += 4) {
//       let min = Infinity;
//       let best;
//       for (let j = 0; j < p.length; j++) {
//         const c = p[j].color;
//         const dist =
//           (data[i] - c[0]) ** 2 +
//           (data[i + 1] - c[1]) ** 2 +
//           (data[i + 2] - c[2]) ** 2;
//         if (dist < min) {
//           min = dist;
//           best = p[j];
//         }
//       }
//       best.vals[0] += data[i];
//       best.vals[1] += data[i + 1];
//       best.vals[2] += data[i + 2];
//       best.count++;
//     }

//     for (let i = 0; i < num; i++) {
//       p[i] = {
//         color: p[i].vals.map((v) => v / p[i].count),
//         vals: p[i].vals.fill(0),
//         count: 0,
//       };
//     }
//   }

//   return p;
// };

const draw = () => {
  ctx.drawImage(img, 0, 0, W, H);
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;

  // console.time();
  // const palette = getPalette(d, 4);
  // console.timeEnd();
  // console.log(palette);

  const m =
    1 / (params.right + params.down + params.downLeft + params.downRight);

  console.time();
  if (params.blackAndWhite) {
    const g = new Float32Array(W * H);

    for (let i = 0; i < d.length; i += 4) {
      g[i / 4] =
        params.red * d[i] + params.green * d[i + 1] + params.blue * d[i + 2];
    }

    for (let i = 0; i < g.length; i++) {
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g[i] < 128 ? 0 : 255;

      const err = (g[i] - d[i * 4]) * m * params.dither;
      g[i + 1] += err * params.right;
      g[i + W] += err * params.down;
      g[i - 1 + W] += err * params.downLeft;
      g[i + 1 + W] += err * params.downRight;
    }
  } else {
    // 8 colors: black, blue, green, cyan, red, magenta, yellow, white

    for (let i = 0; i < d.length; i++) {
      if (i % 4 === 3) continue;

      const o = d[i];
      d[i] = d[i] > 128 ? 255 : 0;

      const err = (o - d[i]) * m * params.dither;
      d[i + 4] += err * params.right;
      d[i + W * 4] += err * params.down;
      d[i + 4 * W - 4] += err * params.downLeft;
      d[i + 4 * W + 4] += err * params.downRight;
    }
  }
  console.timeEnd();

  ctx.putImageData(imgData, 0, 0);

  // palette.forEach(({color}, i) => {
  //   ctx.fillStyle = `rgb(${color.join(',')})`;
  //   ctx.fillRect(5 + 32 * i, 5, 32, 32);
  // });
};

img.addEventListener('load', () => {
  W = canvas.width = window.innerWidth / res;
  H = canvas.height = (img.height / img.width) * W;
  canvas.style.width = W * res + 'px';
  canvas.style.height = H * res + 'px';
  ctx = canvas.getContext('2d');
  draw();
});

const gui = new window.dat.GUI();
for (const p in params) {
  gui.add(params, p, 0, 1).onChange(draw);
}

params.blackAndWhite = true;
gui.add(params, 'blackAndWhite').onChange(draw);

const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('input', (e) => {
  img.src = URL.createObjectURL(e.target.files[0]);
});
params.loadFile = () => fileInput.click();
gui.add(params, 'loadFile').name('Select Image');

img.src = './img.jpeg';
