import {Renderer} from './renderer.js';
import {DIRS} from './consts.js';
import {Game} from './game.js';
import {initEditor} from './editor.js';

const ROWS = 16;
const COLS = 24;

const canvas = document.querySelector('canvas');
const renderer = new Renderer(canvas, ROWS, COLS);
const game = new Game(ROWS, COLS);

const reset = () => {
  game.reset(location.hash);
  renderer.draw(game);
};

window.addEventListener('keypress', (e) => {
  e.preventDefault();
  if (e.code === 'KeyR') reset();
  else if (game.canMove()) {
    if (e.code === 'KeyW') game.moveTank(DIRS.UP);
    else if (e.code === 'KeyA') game.moveTank(DIRS.LEFT);
    else if (e.code === 'KeyS') game.moveTank(DIRS.DOWN);
    else if (e.code === 'KeyD') game.moveTank(DIRS.RIGHT);
    else if (e.code === 'Space') game.shoot();
  }
  renderer.draw(game);
});

const moveLoop = () => {
  const shouldDraw = game.lasers.length || game.tankMoving;
  game.slideTankMoveLasers();
  if (shouldDraw) renderer.draw(game);
  requestAnimationFrame(moveLoop);
};
moveLoop();

setInterval(() => renderer.increment(game), 500);
initEditor({game, canvas, renderer, reset});
