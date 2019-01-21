/*
Each pixel represents a different double pendulum.
Every pendulum is fixed to the center. Its middle hinge
goes to the (x,y) of the pixel representing it and its
end goes to (0,0). As the pendulums move, the x coordinate
of its end dictates how blue the pixel is, its y coordinate
how green, and its speed how red.
*/

'use strict';
console.clear();

var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

var makePendulum = (x, y) => {
  var nodes = [
    {x: 0, y: 0, fixed: true},
    {x, y, xs: 0, ys: 0},
    {x: 0, y: 0, xs: 0, ys: 0}
  ];
  var edges = nodes
    .slice(1)
    .map((a, i) => ({a, b: nodes[i], len: dist(a, nodes[i])}));
  return {
    nodes,
    edges,
    totalLen: edges.reduce((sum, e) => sum + e.len, 0)
  };
};

var iterate = (p, gravity) => {
  for (var i = 0; i < p.nodes.length; i++) {
    var n = p.nodes[i];
    if (n.fixed) continue;
    n.ys += gravity;
    n.x += n.xs;
    n.y += n.ys;
  }
  for (i = 0; i < p.edges.length; i++) {
    var e = p.edges[i];
    var dx = e.b.x - e.a.x;
    var dy = e.b.y - e.a.y;
    var m = 0.5 * (1 - e.len / Math.hypot(dx, dy));
    e.a.xs += dx * m;
    e.a.ys += dy * m;
    e.b.xs -= dx * m;
    e.b.ys -= dy * m;
  }
};

var drawPendulum = (T, edges, size) => {
  T.strokeStyle = 'white';
  T.save();
  T.scale(size, size);
  T.translate(0.5, 0.5);
  T.lineWidth = 1 / size;
  T.beginPath();
  edges.forEach(e => {
    T.moveTo(e.a.x, e.a.y);
    T.lineTo(e.b.x, e.b.y);
  });
  T.stroke();
  T.restore();
};

(() => {
  var gravity = 1e-5;
  var canvas = document.getElementById('C');
  var size = (canvas.width = canvas.height = 400);
  var T = canvas.getContext('2d', {alpha: false});
  var img = T.createImageData(size, size);
  var grid = [];
  var show;

  for (var i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  for (i = 0; i < size * size; i++) {
    grid[i] = makePendulum(
      (i % size) / size - 0.5,
      Math.floor(i / size) / size - 0.5
    );
  }

  var loop = () => {
    requestAnimationFrame(loop);
    for (var i = 0; i < grid.length; i++) {
      var p = grid[i];
      iterate(p, gravity);
      var last = p.nodes[p.nodes.length - 1];
      var x = (last.x + p.totalLen) / p.totalLen / 2;
      var y = (last.y + p.totalLen) / p.totalLen / 2;
      img.data[4 * i + 0] = 1e5 * Math.hypot(last.xs, last.ys);
      img.data[4 * i + 1] = 255 * y;
      img.data[4 * i + 2] = 255 * x;
    }
    T.putImageData(img, 0, 0);
    if (show) drawPendulum(T, show.edges, size);
  };

  canvas.onmousemove = e => {
    var scale = size / e.target.clientHeight;
    var x = Math.floor(e.offsetX * scale);
    var y = Math.floor(e.offsetY * scale);
    show = x >= 0 && x < size && y >= 0 && y < size && grid[y * size + x];
  };

  loop();
})();
