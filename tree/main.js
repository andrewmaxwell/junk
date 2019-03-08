var C = document.querySelector('canvas');
var W = (C.width = innerWidth),
  H = (C.height = innerHeight),
  T = C.getContext('2d');
T.lineCap = 'round';

function grow(b, x, y) {
  b.l = b.l ? b.l + 1 / (1 + b.l) : 0.1;
  var ex = x + b.l * Math.cos(b.a),
    ey = y + b.l * Math.sin(b.a),
    numDesc = 0;
  if (!b.children && Math.random() < 0.01) {
    b.children = [
      {a: b.a + Math.random() - 0.5, l: 1},
      {a: b.a + Math.random() - 0.5, l: 1}
    ];
  }
  for (var i = 0; b.children && i < b.children.length; i++)
    numDesc += grow(b.children[i], ex, ey);
  T.lineWidth = 0.3 + Math.sqrt(numDesc) / 5;
  T.beginPath();
  T.moveTo(x, y);
  T.lineTo(ex, ey);
  T.stroke();
  return numDesc + 1;
}

var tree = {a: -Math.PI / 2};
function loop() {
  requestAnimationFrame(loop);
  T.clearRect(0, 0, W, H);
  grow(tree, W / 2, H);
}
loop();
