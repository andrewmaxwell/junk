'use strict';

var C = document.getElementById('C'),
  W = (C.width = innerWidth),
  H = (C.height = innerHeight),
  T = C.getContext('2d');

var speed = 0.3,
  turnSpeed = 0.1,
  friction = 0.03,
  enemySpeed = 100000,
  maxEnemySpeed = 3,
  badGuyRad = 25,
  addShields = 100,
  enemyDamage = 3,
  enemyFlameSize = 0.5,
  startingShields = 10,
  youRad = 18,
  shieldRad = 40;

var you,
  key = {},
  badGuys,
  candy,
  youDead;

var tootsieRoll = {
    img: new Image(),
    x: -25,
    y: -10
  },
  rocket = {
    img: new Image(),
    x: -33,
    y: -18
  },
  flame = {
    img: new Image(),
    x: -140,
    y: -15
  },
  enemy = {
    img: new Image(),
    x: -25,
    y: -15
  };

tootsieRoll.img.src = 'tootsieRoll.png';
rocket.img.src = 'rocket.png';
flame.img.src = 'flame.png';
enemy.img.src = 'enemy.png';

window.onkeydown = window.onkeyup = function(e) {
  key[{37: 'left', 38: 'up', 39: 'right'}[e.keyCode]] = e.type == 'keydown';
  if (youDead) {
    reset();
    loop();
  }
};

function sqDist(a, b) {
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
}

function reset() {
  you = {
    x: W / 2,
    y: H / 2,
    a: -Math.PI / 2,
    xs: 0,
    ys: 0,
    shields: startingShields
  };
  candy = {
    x: W * Math.random(),
    y: H * Math.random()
  };
  badGuys = [];
  youDead = false;
}

function loop() {
  if (!youDead) window.requestAnimationFrame(loop);

  if (key.left) you.a -= turnSpeed;
  if (key.right) you.a += turnSpeed;

  if (key.up) {
    you.xs += speed * Math.cos(you.a);
    you.ys += speed * Math.sin(you.a);
  }

  you.x += you.xs;
  you.y += you.ys;

  you.xs *= 1 - friction;
  you.ys *= 1 - friction;

  if (you.x < 0) {
    you.x = 0;
    you.xs *= -1;
  } else if (you.x > W) {
    you.x = W;
    you.xs *= -1;
  }
  if (you.y < 0) {
    you.y = 0;
    you.ys *= -1;
  } else if (you.y > H) {
    you.y = H;
    you.ys *= -1;
  }

  if (sqDist(you, candy) < youRad * youRad * 4) {
    candy.x = Math.random() * W;
    candy.y = Math.random() * H;

    badGuys.push({
      x: Math.random() * W,
      y: you.y < H / 2 ? H + badGuyRad : -badGuyRad
    });

    you.shields += addShields / Math.max(you.shields, startingShields);
  }

  T.clearRect(0, 0, W, H);
  T.save();
  T.translate(you.x, you.y);

  if (you.shields) {
    T.strokeStyle = 'rgba(0,255,255,0.3)';
    T.lineWidth = you.shields / 3;
    T.beginPath();
    T.arc(0, 0, shieldRad, 0, Math.PI * 2);
    T.stroke();
  }

  T.rotate(you.a);
  if (key.up) {
    T.save();
    T.translate(Math.random() * -10, 0);
    T.rotate((Math.random() - 0.5) / 10);
    T.drawImage(flame.img, flame.x, flame.y);
    T.restore();
  }
  T.drawImage(rocket.img, rocket.x, rocket.y);
  T.restore();

  for (var i = 0; i < badGuys.length; i++) {
    var b = badGuys[i],
      s = sqDist(you, b),
      d = Math.min(maxEnemySpeed, enemySpeed / s),
      a = Math.atan2(you.y - b.y, you.x - b.x),
      flameScale =
        (d / maxEnemySpeed) * (0.9 + 0.1 * Math.random()) * enemyFlameSize;

    b.x += d * Math.cos(a);
    b.y += d * Math.sin(a);

    T.save();
    T.translate(b.x, b.y);
    T.rotate(a);
    T.drawImage(enemy.img, enemy.x, enemy.y);
    T.scale(flameScale, flameScale);
    T.drawImage(flame.img, flame.x, flame.y);
    T.restore();

    if (you.shields && s < shieldRad * shieldRad + badGuyRad * badGuyRad) {
      you.shields = Math.max(0, you.shields - enemyDamage);
      b.x = you.x - (shieldRad + badGuyRad) * Math.cos(a);
      b.y = you.y - (shieldRad + badGuyRad) * Math.sin(a);
    } else if (s < youRad * youRad) youDead = true;
  }

  T.drawImage(
    tootsieRoll.img,
    candy.x + tootsieRoll.x,
    candy.y + tootsieRoll.y
  );

  if (youDead) {
    T.fillStyle = 'red';
    T.font = '200px Impact';
    T.textAlign = 'center';
    T.textBaseline = 'middle';
    T.fillText('YOU DEAD', W / 2, H / 2);
  }
}

reset();
loop();
