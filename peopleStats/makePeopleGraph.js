import {World2D} from './World2D.js';

const width = innerWidth;
const height = 600;
const stiffness = 0.01;

const minLen = 50;
const maxLen = height;

export const makePeopleGraph = (canvasId, data) => {
  const canvas = document.querySelector('#' + canvasId);
  canvas.width = width;
  canvas.height = height;
  canvas.style.touchAction = 'none';
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'blue';
  ctx.textBaseline = 'middle';

  const world = new World2D({width, height});

  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    d.point = world.addPoint(width * Math.random(), height * Math.random());
    d.textWidth = ctx.measureText(d.name).width;

    const scores = Object.values(d.scores);
    min = Math.min(min, ...scores);
    max = Math.max(max, ...scores);
  }

  for (let i = 1; i < data.length; i++) {
    for (let j = 0; j < i; j++) {
      world.link(
        data[i].point,
        data[j].point,
        minLen +
          (maxLen - minLen) *
            ((data[i].scores[data[j].name] - min) / (max - min))
      );
    }
  }

  const loop = () => {
    ctx.clearRect(0, 0, width, height);

    for (const {a, b, len} of world.constraints) {
      const diff = 1 - Math.hypot(a.x - b.x, a.y - b.y) / len;
      ctx.lineWidth = diff ** 2;
      ctx.strokeStyle = diff > 0 ? '#00F' : '#FF0';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const {name, point, textWidth} of data) {
      ctx.fillText(
        name,
        Math.max(0, Math.min(width - textWidth, point.x - textWidth / 2)),
        point.y
      );
    }

    world.step({stiffness});
    requestAnimationFrame(loop);
  };

  loop();

  let selected;
  const mouseDown = (e) => {
    let closest = Infinity;
    for (const point of world.points) {
      const d = Math.hypot(point.x - e.offsetX, point.y - e.offsetY);
      if (d < closest) {
        closest = d;
        selected = point;
      }
    }
    return false;
  };
  const convertForTouch = (func) => (e) => {
    const {left, top} = e.target.getBoundingClientRect();
    const {pageX, pageY} = e.targetTouches[0];
    func({offsetX: pageX - left, offsetY: pageY - top});
  };
  canvas.addEventListener('mousedown', mouseDown);
  canvas.addEventListener('touchstart', convertForTouch(mouseDown));

  const mouseMove = (e) => {
    if (!selected) return;
    selected.x = e.offsetX;
    selected.y = e.offsetY;
    return false;
  };
  window.addEventListener('mousemove', mouseMove);
  window.addEventListener('touchmove', convertForTouch(mouseMove));

  const mouseUp = () => {
    selected = null;
  };
  window.addEventListener('mouseup', mouseUp);
  window.addEventListener('touchend', mouseUp);
};
