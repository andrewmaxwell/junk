import {Camera} from './camera.js';
import {Renderer} from './renderer.js';
import {initControls} from './controls.js';

const types = {
  and: {rad: 30, color: 'rgba(255,255,255,0.2)', label: 'AND'},
};

class Game {
  constructor() {
    this.units = [{x: 0, y: 0, type: types.and}];
    this.edges = [];
    this.currentType = types.and;
  }
  unitAt(x, y) {
    return this.units.find((u) => Math.hypot(u.x - x, u.y - y) < u.type.rad);
  }
  input({mouse, pressing}) {
    if (!mouse.pressing) {
      if (this.tempEdge) {
        const unit = this.unitAt(mouse.x, mouse.y);
        if (unit && unit !== this.tempEdge.a)
          this.edges.push({a: this.tempEdge.a, b: unit});
      }

      this.dragging = null;
      this.tempEdge = null;
      return;
    }

    if (this.dragging) {
      this.dragging.x = mouse.x;
      this.dragging.y = mouse.y;
      return;
    }

    const unit = this.unitAt(mouse.x, mouse.y);
    const pressingCmd = pressing.MetaLeft || pressing.MetaRight;
    if (unit) {
      if (pressingCmd) {
        this.dragging = {x: mouse.x, y: mouse.y};
        this.tempEdge = {a: unit, b: this.dragging};
      } else {
        this.dragging = unit;
      }
      return;
    }

    if (pressingCmd) {
      this.dragging = {x: mouse.x, y: mouse.y, type: this.currentType};
      this.units.push(this.dragging);
    }
  }
}

const game = new Game();
const camera = new Camera();

const canvas = document.querySelector('canvas');
const renderer = new Renderer(canvas);
const controls = initControls(canvas, camera);

const loop = () => {
  if (document.hasFocus()) {
    camera.move(controls);
    renderer.render(game, camera);
    game.input(controls);
  }
  requestAnimationFrame(loop);
};

loop();
