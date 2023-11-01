const params = {
  alpha: 1.2,
  beta: 1,
  gamma: 1,
};

const canvas = document.createElement('canvas');
document.body.append(canvas);

const ctx = canvas.getContext('2d');
const width = (canvas.width = 600);
const height = (canvas.height = 600);

let imageData, newImageData;

const reset = () => {
  imageData = ctx.createImageData(width, height);
  newImageData = ctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 255 * Math.random(); // r
    imageData.data[i + 1] = 255 * Math.random(); // g
    imageData.data[i + 2] = 255 * Math.random(); // b
    imageData.data[i + 3] = 255; // a
  }
};

const loop = () => {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let A = 0;
      let B = 0;
      let C = 0;
      for (let i = y - 1; i <= y + 1; i++) {
        for (let j = x - 1; j <= x + 1; j++) {
          const nx = (j + width) % width;
          const ny = (i + height) % height;
          const ni = (ny * width + nx) * 4;
          A += imageData.data[ni]; // r
          B += imageData.data[ni + 1]; // g
          C += imageData.data[ni + 2]; // b
        }
      }

      A /= 9 * 255;
      B /= 9 * 255;
      C /= 9 * 255;
      const i = 4 * (y * width + x);
      const {alpha, beta, gamma} = params;
      newImageData.data[i] = (A + A * (alpha * B - gamma * C)) * 255; // r
      newImageData.data[i + 1] = (B + B * (beta * C - alpha * A)) * 255; // g
      newImageData.data[i + 2] = (C + C * (gamma * A - beta * B)) * 255; // b
      newImageData.data[i + 3] = 255; // a
    }
  }

  ctx.putImageData(newImageData, 0, 0);

  [imageData, newImageData] = [newImageData, imageData]; // swap

  requestAnimationFrame(loop);
};

reset();
loop();

const gui = new window.dat.GUI();
gui.add(params, 'alpha', 0, 2);
gui.add(params, 'beta', 0, 2);
gui.add(params, 'gamma', 0, 2);
gui.add({reset}, 'reset');
