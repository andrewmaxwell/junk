import {makeGradient} from './utils.js';

const red = [255, 0, 0];
const tan = [207, 197, 126];
const yellow = [255, 255, 0];
const green = [0, 128, 0];
const white = [255, 255, 255];

export function makeRenderer({width, height}) {
  const canvas = document.createElement('canvas');
  canvas.style['image-rendering'] = 'pixelated';

  const ctx = canvas.getContext('2d', {alpha: false});
  const gradRes = 256;
  const grassGradient = makeGradient(tan, green, gradRes);

  var img, imgData;

  function resize(w, h) {
    canvas.width = width = w;
    canvas.height = height = h;
    img = ctx.createImageData(width, height);
    imgData = img.data;
  }

  function setColor(coord, color) {
    const k = 4 * (coord.y * width + coord.x);
    imgData[k + 0] = color[0];
    imgData[k + 1] = color[1];
    imgData[k + 2] = color[2];
  }

  function renderGrass(cells) {
    for (var i = 0; i < cells.length; i++) {
      setColor(cells[i], grassGradient[Math.floor(cells[i].grass * gradRes)]);
    }
  }

  function renderRaptors(raptors) {
    for (var i = 0; i < raptors.length; i++) {
      var r = raptors[i];
      for (var j = 0; j < r.path.length; j++) {
        setColor(r.path[j], yellow);
      }
      setColor(r, red);
    }
  }

  function renderSheeps(sheeps) {
    for (var i = 0; i < sheeps.length; i++) {
      setColor(sheeps[i], white);
    }
  }

  resize(width, height);

  return {
    canvas,
    resize,
    reset() {
      for (var i = 0; i < imgData.length; i += 4) {
        imgData[i + 0] = 66;
        imgData[i + 1] = 63;
        imgData[i + 2] = 51;
        imgData[i + 3] = 255;
      }
    },
    render(cells, raptors, sheeps) {
      renderGrass(cells);
      renderRaptors(raptors);
      renderSheeps(sheeps);
      ctx.putImageData(img, 0, 0);
    }
  };
}
