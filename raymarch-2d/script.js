'use strict';
console.clear();

class Circle {
  constructor(x, y, rad) {
    this.x = x;
    this.y = y;
    this.rad = rad;
  }
  dist(x, y) {
    return Math.hypot(x - this.x, y - this.y) - this.rad;
  }
  draw(ctx) {
    ctx.moveTo(this.x + this.rad, this.y);
    ctx.arc(this.x, this.y, this.rad, 0, 2 * Math.PI);
  }
}

class Room {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  dist(x, y) {
    return Math.min(x, y, this.width - x, this.height - y);
  }
  draw() {}
}

class Renderer {
  constructor(canvas, width, height) {
    this.width = canvas.width = width;
    this.height = canvas.height = height;
    this.context = canvas.getContext('2d');
  }
  draw(x, y, world) {
    var T = this.context;
    var fov = world.fieldOfVision(x, y);
    // var vis = world.visibleThings(x, y);

    T.clearRect(0, 0, this.width, this.height);

    T.fillStyle = '#777';
    T.beginPath();
    world.things.forEach(thing => thing.draw(T));
    T.fill();

    T.strokeStyle = 'cyan';
    T.beginPath();
    fov.forEach(p => {
      T.moveTo(x, y);
      T.lineTo(p.x, p.y);
    });
    T.stroke();

    // T.strokeStyle = 'red';
    // T.beginPath();
    // vis.forEach(b => {
    //   T.moveTo(x, y);
    //   T.lineTo(b.x, b.y);
    // });
    // T.stroke();
  }
}

class World {
  constructor(things) {
    this.things = things;
  }
  getDistToClosestThing(x, y) {
    var min = Infinity;
    for (var i = 0; min > 1 && i < this.things.length; i++) {
      min = Math.min(min, this.things[i].dist(x, y));
    }
    return min;
  }
  getClosestThing(x, y) {
    var min = Infinity;
    var closest;
    for (var i = 0; min > 1 && i < this.things.length; i++) {
      var thing = this.things[i];
      var dist = thing.dist(x, y);
      if (dist < min) {
        min = dist;
        closest = thing;
      }
    }
    return {dist: min, closest};
  }
  fieldOfVision(x, y, numAngles = 256, maxSteps = 8) {
    var points = [];
    var d1 = this.getDistToClosestThing(x, y);
    for (var i = 0; i < numAngles; i++) {
      var angle = (i / numAngles) * 2 * Math.PI;
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);
      var dist = d1;
      var current = (points[i] = {
        x: x + d1 * dx,
        y: y + d1 * dy
      });
      for (var j = 0; dist > 1 && j < maxSteps; j++) {
        dist = this.getDistToClosestThing(current.x, current.y);
        current.x += dist * dx;
        current.y += dist * dy;
      }
    }
    return points;
  }
  visibleThings(x, y) {
    return this.things.filter(thing => {
      if (thing.x === undefined || thing.y === undefined) return false;
      var m = 1 / Math.hypot(thing.x - x, thing.y - y);
      var dx = (thing.x - x) * m;
      var dy = (thing.y - y) * m;
      var currentX = x;
      var currentY = y;
      var cl;
      do {
        cl = this.getClosestThing(currentX, currentY);
        currentX += cl.dist * dx;
        currentY += cl.dist * dy;
      } while (cl.closest !== thing && cl.dist > 1);
      return cl.closest === thing;
    });
  }
}

const init = () => {
  var width = window.innerWidth;
  var height = window.innerHeight;
  var canvas = document.getElementById('C');
  var renderer = new Renderer(canvas, width, height);

  var room = new Room(width, height);
  var circles = [];
  for (var i = 0; i < 32; i++) {
    circles[i] = new Circle(
      Math.random() * width,
      Math.random() * height,
      5 + 50 * Math.random()
    );
  }
  var world = new World([room, ...circles]);

  var mouseX = width / 2;
  var mouseY = height / 2;
  var frame = 0;
  var loop = () => {
    circles.forEach((c, i) => {
      c.x += Math.sin(i + frame / 64);
      c.y += Math.sin(i + frame / 100);
    });
    renderer.draw(mouseX, mouseY, world);
    frame++;
    requestAnimationFrame(loop);
  };
  canvas.onmousemove = e => {
    mouseX = e.offsetX;
    mouseY = e.offsetY;
  };
  loop();
};
init();
