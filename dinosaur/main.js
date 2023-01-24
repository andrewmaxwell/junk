import {Controls} from './Controls.js';
import {Game} from './Game.js';
import {Renderer} from './Renderer.js';

const width = 1200;
const height = 600;

const renderer = new Renderer(document.querySelector('canvas'), width, height);
const game = new Game(width, height);
const controls = new Controls();

const loop = () => {
  game.tick(controls.pressing);
  renderer.render(game);
  requestAnimationFrame(loop);
};

loop();
