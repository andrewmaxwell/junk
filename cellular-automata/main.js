'use strict';
console.clear();

const base = 3;
const numConditions = 3; // number of cells whose values affect each the value of a given cell
const WIDTH = 100;
const HEIGHT = 128;
const scale = 2;
const colors = [
  // [36, 109, 95],
  // [170, 102, 57],
  // [55, 50, 118],
  // [170, 144, 57]
  [255, 255, 255],
  [0, 0, 0],
  [0, 100, 255]
];

function randomLine(width) {
  return new Array(width).fill(0).map(() => Math.random());
}

function getLine(rule, prev) {
  var res = [];
  var width = prev.length;
  for (var i = 0; i < width; i++) {
    var exp =
      prev[(i - 1 + width) % width] * base * base +
      prev[i] * base +
      prev[(i + 1) % width];
    res[i] = Math.floor(rule / Math.pow(base, exp)) % base;
  }
  return res;
}

function isInteresting(rule, width, height) {
  var prev = randomLine(width);
  var seen = {};
  for (var y = 0; y < height; y++) {
    var line = getLine(rule, prev);
    var str = line.join('');
    for (var s = 0; s < str.length; s++) {
      if (seen[str.substring(s) + str.substring(0, s)]) {
        return false;
      }
    }
    seen[str] = true;
    prev = line;
  }
  return true;
}

function getGrid(rule, width, height) {
  var prev = randomLine(width);
  var res = [];
  for (var y = 0; y < height; y++) {
    prev = res[y] = getLine(rule, prev);
  }
  return res;
}

function getCanvas(rule, width, height, isLooping) {
  var grid = getGrid(rule, width, height);
  var canvas = document.createElement('canvas');
  var T = canvas.getContext('2d', {alpha: false, antialias: false});
  var imageData = T.createImageData(width, 1);
  var D = imageData.data;
  canvas.width = width;
  canvas.height = height;
  canvas.title = rule.toString(base).padStart(Math.pow(base, numConditions), 0);
  canvas.onclick = () => {
    console.log(rule);
    prev = grid[0];
  };
  canvas.ondblclick = () => {
    // window.open(getCanvas(rule, 1600, 900).toDataURL());
    window.open('http://run.plnkr.co/plunks/ujI0XcpvTOqaJUr6fjxa/#' + rule);
  };

  function drawLine(line, y) {
    for (var i = 0; i < line.length; i++) {
      var color = colors[line[i]];
      D[4 * i] = color[0];
      D[4 * i + 1] = color[1];
      D[4 * i + 2] = color[2];
      D[4 * i + 3] = 255;
    }
    T.putImageData(imageData, 0, y);
  }

  for (var i = 0; i < grid.length; i++) {
    drawLine(grid[i], i);
  }
  var prev = grid[grid.length - 1];

  function loop() {
    requestAnimationFrame(loop);
    T.drawImage(canvas, 0, -1);

    var line = getLine(rule, prev);
    drawLine(line, height - 1);
    prev = line;
  }

  if (isLooping) loop();

  return canvas;
}

function init() {
  console.log('Hash exists', location.hash);
  if (location.hash) {
    var rule = parseFloat(location.hash.slice(1));
    document.body.appendChild(
      getCanvas(rule, window.innerWidth, window.innerHeight)
    );
  } else {
    document.head.innerHTML += `<style>canvas {width: ${WIDTH *
      scale}px; height: ${HEIGHT * scale}px}</style>`;
    const numRules = Math.pow(base, Math.pow(base, numConditions));
    console.log('numRules', numRules);
    for (var i = 0, j = 0; j < 100 && i < 10000; i++) {
      var r = Math.floor(Math.random() * numRules);
      if (isInteresting(r, WIDTH, HEIGHT * 2)) {
        document.body.appendChild(getCanvas(r, WIDTH, HEIGHT, true));
        j++;
      }
    }
    console.log('Threw away', Math.round(((i - j) / i) * 100), '%');
  }
}
init();
