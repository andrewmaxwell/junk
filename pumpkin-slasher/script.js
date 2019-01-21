'use strict';
console.clear();

var C = document.querySelector('canvas');
var W = (C.width = 800);
var H = (C.height = 600);
var T = C.getContext('2d');
var pumpkinImg = document.querySelector('#pumpkin');
var skullImg = document.querySelector('#skull');

var gravity = 0.1;

var obs, ex, score, counter, next, dead, swipe, bombs;

var reset = () => {
  obs = [];
  ex = [];
  score = 0;
  counter = 0;
  next = 300;
  dead = false;
  swipe = [];
  bombs = 3;
};

var bounce = p => {
  if (p.x < p.rad) {
    p.x = p.rad;
    p.xs *= -0.5;
  } else if (p.x > W - p.rad) {
    p.x = W - p.rad;
    p.xs *= -0.5;
  }
};

var loop = () => {
  requestAnimationFrame(loop);

  counter--;
  if (Math.random() * counter < 1) {
    counter = next;
    next--;
    obs.push({
      x: W / 2,
      y: -100,
      xs: (Math.random() - 0.5) * 10,
      ys: Math.random() * 3,
      rad: 25 + Math.random() * 35,
      angle: 0,
      skull: Math.random() < 0.1
    });
  }

  T.clearRect(0, 0, W, H);
  T.fillStyle = '#F27503';
  T.beginPath();
  obs.forEach(p => {
    // T.moveTo(p.x + p.rad, p.y);
    // T.arc(p.x, p.y, p.rad, 0, 2 * Math.PI);

    T.save();
    T.translate(p.x, p.y);
    T.rotate(p.angle);
    T.translate(-p.rad, -p.rad);
    T.drawImage(p.skull ? skullImg : pumpkinImg, 0, 0, p.rad * 2, p.rad * 2);
    T.restore();

    if (p.y < H - p.rad) {
      p.ys += gravity;
      p.x += p.xs;
      p.y += p.ys;
      p.angle += Math.PI / 16;
    } else if (!p.skull) dead = true;
    bounce(p);
  });
  ex.forEach(p => {
    T.moveTo(p.x + p.rad, p.y);
    T.arc(p.x, p.y, p.rad, 0, 2 * Math.PI);

    if (p.y <= H - p.rad) {
      p.ys += gravity;
      p.x += p.xs;
      p.y += p.ys;
    } else {
      p.ys = 0;
      p.xs = 0;
      p.rad -= 0.1;
    }
    bounce(p);
  });
  T.fill();

  T.strokeStyle = 'white';
  T.lineWidth = 5;
  T.lineCap = 'round';
  T.beginPath();
  swipe.forEach(s => {
    T.lineTo(s.x, s.y);
    s.a++;
  });
  T.stroke();
  swipe = swipe.filter(s => s.a < 10);

  T.fillStyle = 'white';
  T.font = '20px sans-serif';
  T.textAlign = 'left';
  T.textBaseline = 'bottom';
  T.fillText('Score: ' + score + '   Bombs: ' + bombs, 5, H - 5);

  if (dead) {
    T.fillStyle = 'red';
    T.font = '72px sans-serif';
    T.textAlign = 'center';
    T.textBaseline = 'middle';
    T.fillText('YOU DEAD', W / 2, H / 2);

    T.font = '24px sans-serif';
    T.fillText('Press any key to continue', W / 2, H / 2 + 50);
  }

  ex = ex.filter(p => p.rad > 1);
};

reset();
loop();

const explode = (p, e) => {
  score++;
  for (var j = 0; j < p.rad; j++) {
    var angle = Math.random() * 2 * Math.PI;
    var pow = Math.random() * 5;
    ex.push({
      x: p.x,
      y: p.y,
      xs: p.xs + e.movementX / 5 + pow * Math.cos(angle),
      ys: p.ys + e.movementY / 5 + pow * Math.sin(angle),
      rad: p.rad / Math.sqrt(p.rad),
      a: 0
    });
  }
};

C.onmousemove = e => {
  if (dead) return;

  swipe.push({x: e.offsetX, y: e.offsetY, a: 0});

  obs = obs.filter(p => {
    for (var i = 0; i < 10; i++) {
      var dx = e.offsetX - (e.movementX * i) / 10 - p.x;
      var dy = e.offsetY - (e.movementY * i) / 10 - p.y;
      if (dx * dx + dy * dy < p.rad * p.rad) {
        if (p.skull) {
          dead = true;
          return true;
        }
        explode(p, e);
        return false;
      }
    }
    return true;
  });
};

window.onkeyup = e => {
  if (e.which === 32 && bombs > 0) {
    obs.forEach(p => explode(p, {movementX: 0, movementY: 0}));
    obs = [];
    bombs--;
  }
  if (dead) reset();
};
