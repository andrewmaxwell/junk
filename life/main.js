import {color, makeRenderer} from '../sand/makeRenderer.js';

const makeKernel = (rad) => {
  const kw = 2 * rad + 1;
  const kernel = new Float32Array(kw ** 2);
  let total = 0;
  for (let y = 0; y < kw; y++) {
    for (let x = 0; x < 2 * rad + 2; x++) {
      if (x === rad && y === rad) continue; // no weight to center
      // const dist = Math.hypot(x / rad - 1, y / rad - 1);
      // total += kernel[y * kw + x] = Math.max(0, 1 - 2 * Math.abs(0.5 - dist));
      // total += kernel[y * kw + x] = Math.max(0, 1 - dist);

      const sqDist = (x / rad - 1) ** 2 + (y / rad - 1) ** 2;
      total += kernel[y * kw + x] = Math.max(0, 1 - sqDist);

      // const sqDist = (x - rad) ** 2 + (y - rad) ** 2;
      // total += kernel[y * kw + x] = sqDist <= rad * rad;
    }
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;

  const m = total * 255;
  const render = makeRenderer(document.querySelector('#K'), kw, kw, (v) =>
    color(v * m, v * m, v * m)
  );
  render(kernel);

  return kernel;
};

const getNeighborValue = (x, y, rad, width, height, kernel, data) => {
  let total = 0;
  for (
    let yy = Math.max(0, y - rad);
    yy <= Math.min(height - 1, y + rad);
    yy++
  ) {
    for (
      let xx = Math.max(0, x - rad);
      xx <= Math.min(width - 1, x + rad);
      xx++
    ) {
      total +=
        data[yy * width + xx] *
        kernel[(yy - y + rad) * (rad * 2 + 1) + (xx - x + rad)];
    }
  }
  return total;
};

const black = color(0, 0, 0);
const white = color(255, 255, 255);

const params = {
  width: 400,
  height: 300,
  rad: 3,
  survive: 0.41,
  surviveThreshold: 0.13,
  repro: 0.39,
  reproThreshold: 0.03,
};

const canvas = document.querySelector('#C');

let render, data, data2, kernel;
const reset = () => {
  if (location.hash.length > 1) {
    Object.assign(
      params,
      JSON.parse(decodeURIComponent(location.hash.slice(1)))
    );
  }

  const {width, height, rad} = params;

  render = makeRenderer(canvas, width, height, (val) => (val ? black : white));

  data = new Int8Array(width * height);
  data2 = new Int8Array(width * height);

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(Math.random());
  }

  kernel = makeKernel(rad);
};

const loop = () => {
  const {width, height, rad, survive, surviveThreshold, repro, reproThreshold} =
    params;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighborValue = getNeighborValue(
        x,
        y,
        rad,
        width,
        height,
        kernel,
        data
      );

      data2[y * width + x] = data[y * width + x]
        ? Math.abs(neighborValue - survive) < surviveThreshold
        : Math.abs(neighborValue - repro) < reproThreshold;
    }
  }

  [data, data2] = [data2, data];
  render(data);

  requestAnimationFrame(loop);
};

reset();
loop();

const setHash = () => {
  location.hash = encodeURIComponent(JSON.stringify(params));
};

window.addEventListener('hashchange', reset);

const gui = new window.dat.GUI();

gui.add(params, 'width', 30, 2000, 1).onChange(setHash);
gui.add(params, 'height', 30, 2000, 1).onChange(setHash);
gui.add(params, 'rad', 0, 16, 1).onChange(() => {
  kernel = makeKernel(params.rad);
  setHash();
});
gui.add(params, 'survive', 0, 1, 0.01).onChange(setHash);
gui.add(params, 'surviveThreshold', 0, 1, 0.01).onChange(setHash);
gui.add(params, 'repro', 0, 1, 0.01).onChange(setHash);
gui.add(params, 'reproThreshold', 0, 1, 0.01).onChange(setHash);
gui.add({reset}, 'reset');
