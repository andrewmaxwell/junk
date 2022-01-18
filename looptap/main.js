import {Game} from './Game.js';
import {Renderer} from './Renderer.js';

const game = new Game();
const renderer = new Renderer(document.querySelector('canvas'));

const loop = () => {
  game.tick();
  renderer.render(game);
  requestAnimationFrame(loop);
};

window.addEventListener('mousedown', () => game.click());
window.addEventListener('keydown', () => game.click());

loop();
