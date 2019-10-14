import {Renderer} from './renderer.js';
import {getDistances} from './getDistances.js';
import {rand} from './utils.js';

const canvas = document.querySelector('canvas');
const width = (canvas.width = 800);
const height = (canvas.height = 600);
const renderer = new Renderer({canvas});

let walls, player;

const params = {
  detail: 100,
  viewingAngle: Math.PI / 3,
  wallHeight: 20,
  wallDarkness: 5,
  moveSpeed: 3,
  turnSpeed: 0.07
};

const reset = () => {
  // four walls around area
  walls = [
    {x1: 0, y1: 0, x2: width, y2: 0},
    {x1: width, y1: 0, x2: width, y2: height},
    {x1: width, y1: height, x2: 0, y2: height},
    {x1: 0, y1: height, x2: 0, y2: 0}
  ].map(w => {
    // for some reason, it works best when angles aren't perfectly square?
    w.x1 -= Math.random() / 1000;
    w.y1 += Math.random() / 1000;
    return w;
  });

  const wallMargin = 50;
  for (let i = 0; i < 20; i++) {
    walls.push({
      x1: rand(wallMargin, width - wallMargin),
      y1: rand(wallMargin, height - wallMargin),
      x2: rand(wallMargin, width - wallMargin),
      y2: rand(wallMargin, height - wallMargin)
    });
  }

  player = {
    x: wallMargin,
    y: wallMargin,
    angle: Math.PI / 4,
    move: speed => {
      player.x += speed * Math.cos(player.angle);
      player.y += speed * Math.sin(player.angle);
    },
    turn: speed => {
      player.angle += speed;
    }
  };
};

const loop = () => {
  if (pressing.ArrowUp) player.move(params.moveSpeed);
  if (pressing.ArrowDown) player.move(-params.moveSpeed);
  if (pressing.ArrowLeft) player.turn(-params.turnSpeed);
  if (pressing.ArrowRight) player.turn(params.turnSpeed);

  const distances = getDistances(player, walls, params);
  renderer.draw(player, walls, distances, params);

  requestAnimationFrame(loop);
};

const pressing = {};
window.onkeydown = window.onkeyup = e => {
  pressing[e.key] = e.type === 'keydown';
};

reset();
loop();

const gui = new window.dat.GUI();
gui.add(params, 'detail', 10, width);
gui.add(params, 'viewingAngle', 0, 2 * Math.PI);
gui.add(params, 'wallHeight', 5, 100);
gui.add(params, 'wallDarkness', 1, 10);
gui.add(params, 'moveSpeed', 0.5, 10);
gui.add(params, 'turnSpeed', 0.01, 0.2);
gui.add({reset}, 'reset');
