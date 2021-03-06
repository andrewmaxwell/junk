var canvas = document.querySelector('canvas'),
  ctx = canvas.getContext('2d'),
  width = (canvas.width = innerWidth),
  height = (canvas.height = innerHeight),
  frame = 0,
  branches = [
    {
      x: width / 2,
      y: height / 2,
      rad: 1,
      angle: Math.random() * 2 * Math.PI,
      shrink: 0
    }
  ],
  curviness = 0.1,
  minLength = 300,
  lengthVariance = 1500,
  splitFrequency = 0.01,
  maxNum = 1000,
  radius = 25,
  darkness = 0.2,
  persistence = 15,
  colorSpeed = 0.2;

function loop() {
  requestAnimationFrame(loop);

  if (frame % persistence === 0) {
    ctx.fillStyle = 'rgba(255,255,225,0.01563)';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = 'hsl(' + frame * colorSpeed + ',100%,80%)';
  ctx.lineWidth = darkness;
  ctx.beginPath();
  for (var a, rad, i = 0; i < branches.length; i++) {
    a = branches[i];
    a.rad -= a.shrink;
    rad = a.rad * radius;

    if (rad < 1) branches.splice(i--, 1);
    else {
      a.angle += ((Math.random() - 0.5) * curviness) / a.rad;
      a.x += Math.cos(a.angle);
      a.y += Math.sin(a.angle);

      ctx.moveTo(a.x + rad, a.y);
      ctx.arc(a.x, a.y, rad, 0, Math.PI * 2);

      if (a.x < -rad) a.x = width + rad;
      else if (a.x > width + rad) a.x = -rad;
      if (a.y < -rad) a.y = height + rad;
      else if (a.y > height + rad) a.y = -rad;

      if (branches.length < maxNum && Math.random() < splitFrequency)
        branches.push({
          x: a.x,
          y: a.y,
          rad: a.rad,
          angle: a.angle,
          shrink: 1 / (minLength + Math.random() * lengthVariance)
        });
    }
  }
  ctx.fill();
  ctx.stroke();

  frame++;
}

canvas.onclick = function(e) {
  branches.push({
    x: e.offsetX,
    y: e.offsetY,
    rad: 1,
    angle: Math.random() * 2 * Math.PI,
    shrink: 0
  });
};

var gui = new window.dat.GUI();
gui.add(this, 'maxNum', 300, 10000);
gui.add(this, 'curviness', 0, 0.5);
gui.add(this, 'splitFrequency', 0, 0.1);
gui.add(this, 'radius', 1, 50);
gui.add(this, 'minLength', 1, 1000);
gui.add(this, 'lengthVariance', 0, 5000);
gui.add(this, 'colorSpeed', 0, 1);
gui.add(this, 'darkness', 0, 1);
gui.add(this, 'persistence', 0, 50).step(1);
gui.close();

loop();
