var opts = {random: 0, circle: 0};

var pointInRect = function (x, y, x1, y1, x2, y2) {
    return (
      Math.abs(x - (x1 + x2) / 2) * 2 < Math.abs(x1 - x2) &&
      Math.abs(y - (y1 + y2) / 2) * 2 < Math.abs(y1 - y2)
    );
  },
  reflect = function (s, maxLength, edges) {
    var x1 = s.x,
      y1 = s.y,
      x2 = x1 + maxLength * s.xs,
      y2 = y1 + maxLength * s.ys,
      closest = {x: x2, y: y2, d: maxLength * maxLength};
    for (var i = 0; i < edges.length; i++) {
      if (s.e != edges[i]) {
        var x3 = edges[i].p1.x,
          y3 = edges[i].p1.y,
          x4 = edges[i].p2.x,
          y4 = edges[i].p2.y,
          p1 = x1 * y2 - y1 * x2,
          p2 = x3 * y4 - y3 * x4,
          den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4),
          px = (p1 * (x3 - x4) - (x1 - x2) * p2) / den,
          py = (p1 * (y3 - y4) - (y1 - y2) * p2) / den;
        if (
          pointInRect(px, py, x1, y1, x2, y2) &&
          pointInRect(px, py, x3, y3, x4, y4)
        ) {
          var d = sqDist(x1 - px, y1 - py);
          if (d < closest.d) closest = {x: px, y: py, d, e: edges[i]};
        }
      }
    }
    if (closest.e != undefined) {
      var dot = closest.e.xs * s.xs + closest.e.ys * s.ys;
      closest.xs = -s.xs + 2 * closest.e.xs * dot;
      closest.ys = -s.ys + 2 * closest.e.ys * dot;
      closest.d = Math.sqrt(closest.d);
    }
    return closest;
  },
  sqDist = function (x, y) {
    return x * x + y * y;
  },
  dist = function (x, y) {
    return Math.sqrt(x * x + y * y);
  },
  drawEdges = function (context, edges) {
    context.lineWidth = 2;
    context.strokeStyle = 'white';
    context.beginPath();
    for (var i = edges.length; i--; ) {
      context.moveTo(edges[i].p1.x, edges[i].p1.y);
      context.lineTo(edges[i].p2.x, edges[i].p2.y);
    }
    context.stroke();
  },
  makeBeams = function (
    context,
    x,
    y,
    num,
    edges,
    beamLength,
    reflectivity,
    start,
    speed
  ) {
    for (var i = start; i < start + speed && (opts.random || i < num); i++) {
      var a = (opts.random ? Math.random() : i / num) * 2 * Math.PI + 1,
        t = {x, y, xs: Math.cos(a), ys: Math.sin(a)},
        opacity = 1,
        X = x,
        Y = y;
      for (var len = 0; opacity > 0; len += t.d, opacity *= reflectivity) {
        t = reflect(t, beamLength, edges);

        var G = context.createLinearGradient(X, Y, t.x, t.y);
        G.addColorStop(0, 'rgba(255,255,255,' + opacity + ')');
        opacity = Math.floor(1000 * (opacity - t.d / beamLength)) / 1000;
        G.addColorStop(1, 'rgba(255,255,255,' + opacity + ')');
        context.strokeStyle = G;

        context.beginPath();
        context.moveTo(X, Y);
        context.lineTo((X = t.x), (Y = t.y));
        context.stroke();
      }
    }
  },
  makeEdge = function (p1, p2) {
    var len = dist(p1.x - p2.x, p1.y - p2.y);
    return {
      p1,
      p2,
      xs: (p2.x - p1.x) / len,
      ys: (p2.y - p1.y) / len,
    };
  },
  circle = function (x, y, rad) {
    var n = 300,
      last = {
        x: x + rad * Math.cos(0),
        y: y + rad * Math.sin(0),
      };
    for (var i = 1; i < n; i++) {
      var next = {
        x: x + rad * Math.cos(((2 * Math.PI) / n) * (i + 1)),
        y: y + rad * Math.sin(((2 * Math.PI) / n) * (i + 1)),
      };
      edges.push(makeEdge(last, next));
      last = next;
    }
  };

var C = document.body.childNodes[0],
  W = (C.width = innerWidth),
  H = (C.height = innerHeight),
  T = C.getContext('2d'),
  numBeams = 15000,
  edges = [],
  down = 0,
  beamLength = 5e4,
  reflectivity = 0.95,
  timeout,
  start = 0,
  speed = 10;
// topLeft = {x: -Math.random(), y: -Math.random()},
// topRight = {x: W + Math.random(), y: -Math.random()},
// bottomLeft = {x: -Math.random(), y: H + Math.random()},
// bottomRight = {x: W + Math.random(), y: H + Math.random()};
//edges.push(makeEdge(topLeft, topRight), makeEdge(topRight, bottomRight), makeEdge(bottomRight, bottomLeft), makeEdge(bottomLeft, topLeft))

if (opts.circle) {
  circle(W / 2, H / 2, H / 2);
  drawEdges(T, edges);
}

onmousemove = function (e) {
  if (down) {
    clearTimeout(timeout);
    T.clearRect(0, 0, W, H);
    drawEdges(T, edges);
    var now = {x: e.x + Math.random() - 0.5, y: e.y + Math.random() - 0.5};
    if (down.x != undefined) edges.push(makeEdge(now, down));
    down = now;
  }
};
C.onmousedown = function (e) {
  down = 1;
  clearTimeout(timeout);
  start = 0;
  T.clearRect(0, 0, W, H);
  drawEdges(T, edges);
  T.lineWidth = 0.04;
  var draw = function () {
    makeBeams(
      T,
      e.x,
      e.y,
      numBeams,
      edges,
      beamLength,
      reflectivity,
      start,
      speed
    );
    start += speed;
    if (opts.random || start < numBeams) timeout = setTimeout(draw, 0);
  };
  timeout = setTimeout(draw, 100);
};
onmouseup = function () {
  down = 0;
};
