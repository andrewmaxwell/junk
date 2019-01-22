import {SimplexNoise} from './simplex.js';

export const randomIndex = arr => arr[Math.floor(Math.random() * arr.length)];

export const shuffle = arr => {
  let counter = arr.length;
  while (counter > 0) {
    let index = Math.floor(Math.random() * counter);
    counter--;
    let temp = arr[counter];
    arr[counter] = arr[index];
    arr[index] = temp;
  }
  return arr;
};

export const makeGradient = (color1, color2, resolution) => {
  var gradient = [];
  for (var i = 0; i <= resolution; i++) {
    var amt = i / resolution;
    var a1 = 1 - amt;
    gradient[i] = [];
    for (var j = 0; j < color1.length; j++) {
      gradient[i][j] = Math.floor(color1[j] * a1 + color2[j] * amt);
    }
  }
  return gradient;
};

var simplex = new SimplexNoise();
export const noise = (x, y) => simplex.noise2D(x, y) * 0.5 + 0.5;
