import 'https://code.jquery.com/jquery-3.3.1.min.js';
import {Controls} from '../common/Controls.js';

var C = document.body.childNodes[0],
  W = (C.width = C.height = innerHeight),
  T = C.getContext('2d'),
  D = T.createImageData(W, W),
  d = D.data,
  p,
  st = 0,
  colors = [
    [0, 0, 0],
    [0, 64, 255],
    [255, 255, 255],
    [255, 200, 0]
  ],
  L = colors.length * 64,
  col = colorRange(colors, L),
  draw = function() {
    var sc, y, ci, x, cr, zr, zi, n, zr2, zi2, k, g;
    for (sc = p.s / W, y = W; y--; ) {
      ci = p.y + y * sc;
      for (x = W; x--; ) {
        zr = cr = p.x + x * sc;
        zi = ci;
        for (n = 0; n < p.i; n++) {
          zr2 = zr * zr;
          zi2 = zi * zi;
          if (zr2 + zi2 > 4) break;
          zi = 2 * zr * zi + ci;
          zr = zr2 - zi2 + cr;
        }
        k = 4 * (y * W + x);
        g = ((n / p.i) * (L - 1)) << 0;
        d[k] = col[g][0];
        d[k + 1] = col[g][1];
        d[k + 2] = col[g][2];
        d[k + 3] = 255;
      }
    }
    T.putImageData(D, 0, 0);
  };

onhashchange = function() {
  var v = location.hash.substring(1).split(',');
  p = {
    x: parseFloat(v[0]),
    y: parseFloat(v[1]),
    s: parseFloat(v[2]),
    i: parseFloat(v[3])
  };
  draw();
};

C.onmousedown = function(e) {
  st = {x: e.pageX, y: e.pageY};
};
C.onmouseup = function(e) {
  if (st) {
    location.hash = [
      p.x + (st.x / W) * p.s,
      p.y + (st.y / W) * p.s,
      (Math.max(e.pageX - st.x, e.pageY - st.y) / W) * p.s,
      p.i
    ].join(',');
    st = 0;
  }
};
C.onmousemove = function(e) {
  if (st) {
    T.putImageData(D, 0, 0);
    T.strokeStyle = 'lime';
    var m = Math.max(e.pageX - st.x, e.pageY - st.y);
    T.strokeRect(st.x - 0.5, st.y - 0.5, m, m);
  }
};
// onclick=function(e){
// location.hash=[p.x+e.pageX/W*p.s/2, p.y+e.pageY/W*p.s/2, p.s/2, p.i].join(",")
// }
onkeyup = function(e) {
  if (e.keyCode == 38) {
    location.hash = [p.x, p.y, p.s, Math.ceil(p.i * 1.25)].join(',');
  } else if (e.keyCode == 40) {
    location.hash = [p.x, p.y, p.s, Math.floor(p.i * 0.8)].join(',');
  }
};

if (location.hash.length < 6) location.hash = '-2,-1.3,2.6,256';
onhashchange();

function colorRange(colors, rangeLen) {
  var res = [],
    k,
    n = colors.length,
    r = rangeLen / n,
    t,
    i,
    j,
    p;
  for (i = 0; i < n; i++) {
    for (j = 0; j < r; j++) {
      (k = j / r), (t = res[i * r + j] = []);
      for (p = 0; p < colors[i].length; p++) {
        t[p] = colors[i][p] * (1 - k) + colors[(i + 1) % n][p] * k;
      }
    }
  }
  return res;
}

Controls({
  instructions:
    "<ul style='padding:15px'><li>Drag the mouse to draw a square over where you'd like to zoom in.</li><li>To zoom back out, hit the browser's back button.</li><li>Use the up and down arrows to change the number of iterations used to calculate the mandelbrot set.</li></ul>"
});
