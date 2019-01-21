'use strict';

module.exports = function Grapher({canvas, width, height}) {
  canvas.width = width;
  canvas.height = height;

  var T = canvas.getContext('2d');

  var graph = (raw, color) => {
    var vals = new Array(width).fill(0);
    var counts = new Array(width).fill(0);
    for (var i = 0; i < raw.length; i++) {
      var x = Math.floor((i * width) / raw.length);
      vals[x] += raw[i];
      counts[x]++;
    }

    var minY = Infinity;
    var maxY = -Infinity;
    for (i = 0; i < width; i++) {
      vals[i] /= counts[i];
      minY = Math.min(minY, vals[i]);
      maxY = Math.max(maxY, vals[i]);
    }

    var xMult = width / vals.length;
    var yMult = height / (maxY - minY);

    T.strokeStyle = color;
    T.beginPath();
    for (i = 0; i < vals.length; i++) {
      T.lineTo(i * xMult, height - (vals[i] - minY) * yMult);
    }
    T.stroke();
  };

  this.render = lines => {
    T.clearRect(0, 0, width, height);
    lines.forEach(l => graph(l.data, l.color));
  };
};
