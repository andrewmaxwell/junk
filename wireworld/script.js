'use strict';
console.clear();

// https://www.quinapalus.com/wires0.html

// var BLANK = 0,
var WIRE = 1,
  TAIL = 2,
  HEAD = 3;
// var symbols = {' ': BLANK, '#': WIRE, '~': TAIL, '@': HEAD};
var colors = [
  [200, 117, 0],
  [255, 255, 255],
  [0, 128, 255]
];

var makeRenderer = (canvas, width, height, scale = 1) => {
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = width * scale + 'px';
  canvas.style.height = height * scale + 'px';

  var context = canvas.getContext('2d', {antialias: false, alpha: false});
  var img = context.createImageData(width, height);
  for (var i = 3; i < img.data.length; i += 4) img.data[i] = 255;

  return (vals, indexes) => {
    for (var a = 0; a < indexes.length; a++) {
      var i = indexes[a];
      var color = colors[vals[i] - 1];
      img.data[4 * i + 0] = color[0];
      img.data[4 * i + 1] = color[1];
      img.data[4 * i + 2] = color[2];
    }
    context.putImageData(img, 0, 0);
  };
};

var parseInput = inputStr => {
  // var lines = inputStr.split('\n');
  // var [width, height] = lines[0].trim().split(' ').map(n => parseInt(n, 10));
  // var vals = new Uint8Array(width * height);
  // lines.slice(1).forEach((line, i) => line.split('').forEach((c, j) => {
  //   if (symbols[c] === undefined) console.error(`Bad symbol at r${i} c${j}: ${c} (${c.charCodeAt(0)})`);
  //   vals[i * width + j] =  symbols[c];
  // }));
  var dictionary = '0123'.split('');
  var w = '';
  return {
    width: 631,
    height: 958,
    vals: inputStr
      .match(/.../g)
      .map((val, i) => {
        var e = dictionary[parseInt(val, 36)] || w + w.charAt(0);
        if (i) dictionary.push(w + e.charAt(0));
        return (w = e);
      })
      .join('')
      .split('')
      .map(v => parseInt(v, 10))
  };
};

var getActiveIndexes = (vals, width) => {
  // return vals.map((val, i) => val ? i : 0).filter(i => i);
  var dirs = [
    -width - 1,
    -width,
    -width + 1,
    -1,
    1,
    width - 1,
    width,
    width + 1
  ];
  var queue = [vals.findIndex(val => val)];
  var seen = {[queue[0]]: true};
  for (var i = 0; i < queue.length; i++) {
    for (var j = 0; j < dirs.length; j++) {
      var neighborIndex = queue[i] + dirs[j];
      if (vals[neighborIndex] && !seen[neighborIndex]) {
        queue.push(neighborIndex);
        seen[neighborIndex] = true;
      }
    }
  }
  return queue;
};

var makeIterator = (vals, indexes, width) => {
  var speed = 100;
  var current = vals;
  var next = vals.slice();

  var hasOneOrTwoNeighborHeads = i => {
    var num =
      (current[i - width - 1] === HEAD) +
      (current[i - width] === HEAD) +
      (current[i - width + 1] === HEAD) +
      (current[i - 1] === HEAD) +
      (current[i + 1] === HEAD) +
      (current[i + width - 1] === HEAD) +
      (current[i + width] === HEAD) +
      (current[i + width + 1] === HEAD);
    return num === 1 || num === 2;
  };

  return () => {
    for (var s = 0; s < speed; s++) {
      for (var a = 0; a < indexes.length; a++) {
        var i = indexes[a];
        var o = current[i];
        next[i] =
          o === HEAD
            ? TAIL
            : o === TAIL
            ? WIRE
            : hasOneOrTwoNeighborHeads(i)
            ? HEAD
            : WIRE;
        // next[i] = o === WIRE ? hasOneOrTwoNeighborHeads(i) ? HEAD : WIRE : o - 1;
      }
      [current, next] = [next, current];
    }
    return current;
  };
};

var measurePerformance = func => {
  var p = window.performance;
  var total = 0,
    count = 0;
  setInterval(
    () =>
      console.log({
        total: Math.round(total),
        count,
        average: Math.round((total / count) * 10) / 10
      }),
    1000
  );
  return () => {
    var start = p.now();
    var res = func();
    total += p.now() - start;
    count++;
    return res;
  };
};

var init = () => {
  var {width, height, vals} = parseInput(
    document.getElementById('input').innerHTML
  );
  var indexes = getActiveIndexes(vals, width);
  var render = makeRenderer(document.getElementById('C'), width, height);
  var getNextIteration = measurePerformance(makeIterator(vals, indexes, width));
  var loop = () => {
    requestAnimationFrame(loop);
    render(getNextIteration(), indexes);
  };
  loop();
};

init();

// var compress = (n, d, w = '') => n.split('').reduce((r, c) => {
//   if (d.includes(w + c)) w += c;
//   else {
//     r.push(d.indexOf(w));
//     d.push(w + c);
//     w = c;
//   }
//   return r;
// }, []).concat(d.indexOf(w)).map(v => v.toString(36).padStart(3, 0)).join('');

// var decompress = (n, d, w = '') => n.match(/.../g).map((k, i) => {
//   var e = d[parseInt(k, 36)] || w + w.charAt(0);
//   if (i) d.push(w + e.charAt(0));
//   return (w = e);
// }).join('');

// var input = parseInput(document.getElementById('input').innerHTML).vals.join('');
// // var input = '0101011112211';

// console.time('compress');
// var compressed = compress(input, '0123'.split(''));
// console.timeEnd('compress');

// console.time('decompress');
// var decompressed = decompress(compressed, '0123'.split(''));
// console.timeEnd('decompress');

// console.log((100 - 100 * compressed.length / input.length).toFixed(2));

// if (input !== decompressed) {
//   console.error('Output is different from input!');
// }
// console.log(compressed);
