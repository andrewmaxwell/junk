import 'https://code.jquery.com/jquery-3.3.1.min.js';
import {Controls} from '../common/Controls.js';

var N = document.querySelector('canvas'),
  W = (N.width = innerWidth),
  H = (N.height = innerHeight),
  T = N.getContext('2d'),
  L = 0,
  S = 40,
  E = 15,
  A = [],
  newGear = 0,
  m = 0,
  C = 0,
  M = Math,
  P = M.PI,
  D = function(x, y) {
    return M.sqrt(x * x + y * y);
  };

setInterval(function() {
  T.clearRect(0, 0, W, H);
  for (var j = L; j--; ) {
    var x = A[j];
    T.fillStyle = j ? '#AAA' : '#666';
    T.beginPath();
    for (var i = 0; i < x.t * 2; i++)
      T.arc(
        x.x,
        x.y,
        (S * x.t) / P + (i % 2 ? E : 0),
        ((i + 0.5 / x.t) * P) / x.t + x.a,
        ((i + 1 - 0.5 / x.t) * P) / x.t + x.a
      );
    T.closePath();
    T.fill();
    if (x != A[0]) {
      for (i = 0; i < L; i++) {
        var o = A[i];
        if (o != x) {
          var d = D(o.x - x.x, o.y - x.y),
            minDist = (S / P) * (x.t + o.t) + E;
          if (d < minDist + E) {
            var a = M.atan2(x.y - o.y, x.x - o.x);
            if (d < minDist && x != C) {
              x.x = o.x + minDist * M.cos(a);
              x.y = o.y + minDist * M.sin(a);
            }
            x.a = (o.t / x.t + 1) * (a - o.a) + o.a + P;
            break;
          }
        }
      }
    }
  }
  if (L) A[0].a += 0.15 / A[0].t;
}, 20);

N.onmousedown = function(e) {
  for (var i = L; i--; ) {
    if (D(e.pageX - A[i].x, e.pageY - A[i].y) < (A[i].t * S) / P + E) {
      C = A[i];
      break;
    }
  }
  if (!C) newGear = A[L++] = {x: e.pageX, y: e.pageY, t: 2, a: 0};
};

ondblclick = function(e) {
  for (var i = 0; i < L; i++) {
    if (D(e.pageX - A[i].x, e.pageY - A[i].y) < (A[i].t * S) / P + E) {
      A.splice(i--, 1);
      L--;
      break;
    }
  }
};
onmouseup = function() {
  newGear = C = 0;
};
onmousemove = function(e) {
  if (C) {
    C.x += e.pageX - m.x;
    C.y += e.pageY - m.y;
    for (var i = 0; i < L; i++) {
      var o = A[i],
        minDist = (S / P) * (C.t + o.t) + E;
      if (o != C && D(o.x - C.x, o.y - C.y) < minDist) {
        var a = M.atan2(C.y - o.y, C.x - o.x);
        C.x = o.x + minDist * M.cos(a);
        C.y = o.y + minDist * M.sin(a);
        C.a = (o.t / C.t + 1) * (a - o.a) + o.a + P;
      }
    }
  } else if (newGear)
    newGear.t = M.max(
      2,
      M.floor(D(e.pageX - newGear.x, e.pageY - newGear.y) / (S / P))
    );
  m = {x: e.pageX, y: e.pageY};
};

Controls({
  instructions:
    "<ul style='padding:0 15px'><li>Click and drag to make a gear.</li><li>Drag gears around to move them.</li><li>Double click gears to delete them.</li></ul>"
});
