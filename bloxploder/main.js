import 'https://code.jquery.com/jquery-3.3.1.slim.min.js';
const {$} = window;

for (
  var s = 30,
    A = [],
    co = ['purple', 'orange', 'red', 'green', 'blue'],
    dn,
    st,
    an,
    score,
    fr,
    x,
    y,
    dr = (dn = st = false),
    sh = [],
    pts = [],
    C = $('canvas')[(x = y = an = score = fr = 0)],
    H = (C.width = C.height = 600),
    T = C.getContext('2d'),
    M = Math,
    S = H / s,
    R = M.random,
    F = M.floor,
    cl = [],
    go,
    num,
    b,
    i,
    h,
    z,
    p,
    name,
    user,
    ne,
    n,
    l,
    points,
    f,
    a,
    d,
    j,
    dir,
    brr,
    it,
    ss,
    t,
    u,
    time,
    secs;
  x < s;
  x++
)
  for (y = 0, A[x] = []; y < s; y++)
    A[x][y] = {x, xx: s, y, yy: s, c: F(R() * co.length)};
T.font = "bold 32px 'Gill Sans'";
var draw = function() {
  for (
    go = false, dr = true, T.clearRect((x = num = 0), 0, H, H), fr++;
    x < s;
    x++
  ) {
    for (y = 0; y < s; y++) {
      b = A[x][y];
      if (b.c != -1 && y + x < fr) {
        if (M.abs(b.x - b.xx) || M.abs(b.y - b.yy)) {
          b.xx = M.abs(b.x - b.xx) < s / 1e3 ? b.x : b.xx + (b.x - b.xx) / 10;
          b.yy = M.abs(b.y - b.yy) < s / 1e3 ? b.y : b.yy + (b.y - b.yy) / 10;
          go = true;
        }
        T.fillStyle = co[b.c];
        T.fillRect(b.xx * S, b.yy * S, S, S);
        num++;
      }
    }
  }
  for (i = sh.length; i--; ) {
    h = sh[i];
    z = h.l -= 0.1;
    T.fillStyle = 'rgba(0,0,0,0.5)';
    T.fillRect(
      (h.x += h.xs) - z + 2,
      (h.y += h.ys += 0.5) - z + 2,
      z * 2,
      z * 2
    );
    T.fillStyle = co[h.c];
    T.fillRect(h.x - z, h.y - z, z * 2, z * 2);
    go = true;
    if (z <= 0 || h.y > H) sh.splice(i, 1);
  }
  for (i = pts.length; i--; ) {
    p = pts[i];
    x = p.x * S + 2 * M.sin(fr / 2);
    y = (p.y -= 1 / s) * S;
    T.fillStyle = 'black';
    T.fillText(p.t, x + 2, y + 2);
    T.fillStyle = 'white';
    T.fillText(p.t, x, y);
    p.l ? p.l-- : (p.l = 30);
    go = true;
    if (p.l == 0) pts.splice(i, 1);
  }
  if (!num) dn = F((new Date() - st) / 1000);
  if (go) setTimeout(draw, 20);
  else if (((dr = false), num == 0)) {
    if ((name = prompt('Enter your name:', user)))
      $.post(' #hs', {n: name, s: cl.join(';')}, function() {
        location.reload();
      });
  }
};

C.onclick = function(e) {
  if (!st) st = new Date();
  b = A[F((e.pageX / H) * s)][F((e.pageY / H) * s)];
  if (b.c != -1) {
    (ne = function(b, a) {
      a.push(b);
      var x = b.x,
        y = b.y;
      if (x > 0 && A[x - 1][y].c == b.c && a.indexOf(A[x - 1][y]) == -1)
        ne(A[x - 1][y], a);
      if (x < s - 1 && A[x + 1][y].c == b.c && a.indexOf(A[x + 1][y]) == -1)
        ne(A[x + 1][y], a);
      if (y > 0 && A[x][y - 1].c == b.c && a.indexOf(A[x][y - 1]) == -1)
        ne(A[x][y - 1], a);
      if (y < s - 1 && A[x][y + 1].c == b.c && a.indexOf(A[x][y + 1]) == -1)
        ne(A[x][y + 1], a);
    })(b, (n = [])),
      (l = n.length),
      (points = l == 1 ? -25 : l == 2 ? -10 : 5 * M.round((l * l) / 5));
    cl.push(F(new Date() / 1000) + ',' + l + ',' + b.c);
    $('#score').html((score += points) + ' Points');
    pts.push({t: points, x: n[0].x, y: n[0].y});
    n.sort(function(m, n) {
      return n.y - m.y;
    });
    for (i = l; i--; ) {
      for (j = 20, f = n[i]; --j; )
        (a = R() * M.PI * 2),
          (d = 3 + 2 * R()),
          sh.push({
            x: f.x * S,
            y: f.y * S,
            c: f.c,
            xs: d * M.cos(a),
            ys: d * M.sin(a) - 6,
            l: H / 4 / s
          });
      f.c = -1;
      while (f.y > 0 && A[f.x][f.y - 1].c != -1) swap(f, A[f.x][f.y - 1]);
    }
    if (!dr) draw();
  }
};

onkeydown = function(e) {
  e = e.keyCode;
  if (e == 37 || e == 39) rotate(e == 39);
};

function rotate(r) {
  if (an) return;
  for (dir = r ? 1 : -1, an += dir ^ 1 ? 90 : -90, brr = [], x = 0; x < s; x++)
    for (y = 0, brr[x] = []; y < s; y++)
      (it = brr[x][y] = dir > 0 ? A[y][s - x - 1] : A[s - y - 1][x]),
        (it.x = it.xx = x),
        (it.y = it.yy = y);
  for (x = 0, A = brr; x < s; x++)
    for (y = 0; y < s; y++)
      if (((f = A[x][y]), f.c == -1))
        while (f.y > 0 && A[f.x][f.y - 1].c != -1) swap(f, A[f.x][f.y - 1]);
  if (!dr) draw();
  rt();
  cl.push(r ? 'r' : 'l');
}
function rt() {
  if (an) {
    ss = 'rotate(' + (an = M.abs(an) < 1 / 10 ? 0 : an * 0.85) + 'deg)';
    $(C).css({'-webkit-transform': ss, '-moz-transform': ss});
    setTimeout(rt, 20);
  }
}
function swap(a, b) {
  (A[(t = a.x)][(u = a.y)] = b),
    (A[(a.x = b.x)][(a.y = b.y)] = a),
    (b.x = t),
    (b.y = u);
}
setInterval(function() {
  if (st && !dn) {
    (time = (new Date() - st) / 1000), (secs = F(time) % 60);
    $('#time').html(F(time / 60) + ':' + (secs < 10 ? '0' + secs : secs));
    if (time) $('#ppm').html(F((score / time) * 100) / 100 + ' p/s');
  }
}, 200);

draw();
