const width = 256;
const height = 256;
const colors = [
  [0, 0, 0, 255], // black
  [255, 0, 0, 255], // red
  [0, 255, 0, 255], // green
  [0, 0, 255, 255], // blue
  [255, 255, 0, 255], // yellow
  [0, 255, 255, 255], // cyan
  [255, 0, 255, 255], // magenta
  [128, 128, 128, 255], // gray
  [255, 255, 255, 255] // white
];
const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const rand = max => Math.floor(Math.random() * max);

const addDummyRects = (data, num) => {
  for (let i = 0; i < num; i++) {
    const val = rand(colors.length);
    const vert = Math.random() < 0.5;
    const w = rand(1 + (vert ? 1 : width - 1));
    const h = rand(1 + (vert ? height - 1 : 1));
    const x = rand(width - w);
    const y = rand(height - h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) data[y + r][x + c] = val;
    }
  }
};

const fill = (data, x, y, val) => {
  const prevVal = data[y][x];
  const xc = [x];
  const yc = [y];
  for (let i = 0; i < xc.length; i++) {
    if (!data[yc[i]] || data[yc[i]][xc[i]] !== prevVal) continue;
    data[yc[i]][xc[i]] = val;
    for (let j = 0; j < dirs.length; j++) {
      xc.push(xc[i] + dirs[j][0]);
      yc.push(yc[i] + dirs[j][1]);
    }
  }
  // const prevVal = data[y][x];
  // data[y][x] = val;
  // for (let i = 0; i < dirs.length; i++) {
  //   const nx = dirs[i][0] + x;
  //   const ny = dirs[i][1] + y;
  //   if (data[ny] && data[ny][nx] === prevVal) fill(data, nx, ny, val);
  // }
};

const makeRenderer = () => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  canvas.width = width;
  canvas.height = height;
  return data => {
    imageData.data.set(data.flat().flatMap(v => colors[v]));
    ctx.putImageData(imageData, 0, 0);
  };
};

const init = () => {
  const data = new Array(height).fill().map(() => new Array(width).fill(0));
  addDummyRects(data, 10000);

  const render = makeRenderer();
  render(data);

  window.addEventListener('click', ({offsetX, offsetY}) => {
    let val;
    const x = Math.floor((offsetX / window.innerWidth) * width);
    const y = Math.floor((offsetY / window.innerHeight) * height);
    do {
      val = rand(colors.length);
    } while (val === data[y][x]);
    fill(data, x, y, val);
    render(data);
  });
};

init();
