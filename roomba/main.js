import {calcScore} from './calcScore/index.js';
import {getEditor} from './getEditor.js';
import {Renderer} from './Renderer.js';
import {Room} from './Room.js';
import {makeFunction, Roomba} from './Roomba.js';

const width = 800;
const height = 600;
const renderer = new Renderer(document.querySelector('#room'), width, height);
const editor = await getEditor(document.querySelector('#code'));
const errorPre = document.querySelector('#error');

const params = {simSpeed: 1};

let roomba, room, stats;

const reset = () => {
  const code = editor.getValue();
  location.hash = btoa(code);
  errorPre.innerHTML = '';
  let func;
  try {
    func = makeFunction(code);
    stats = [];
    room = new Room(width, height);
    roomba = new Roomba(room, func);
    calcScore({iterations: 10000, width, height, code: editor.getValue()});
  } catch (e) {
    console.error(e);
    errorPre.innerText = e.message;
  }
};

const loop = () => {
  for (let i = 0; i < params.simSpeed; i++) {
    roomba.move(room);
    stats.push(room.getPercentClean());
  }
  renderer.render(roomba, room, stats);
  requestAnimationFrame(loop);
};

const gui = new window.dat.GUI({autoPlace: false});
gui.add(params, 'simSpeed', 1, 100, 1);
gui.add({['Update Code & Restart']: reset}, 'Update Code & Restart');
document.querySelector('#gui').append(gui.domElement);

const hashChange = () => {
  editor.setValue(
    location.hash.length > 2
      ? atob(location.hash.slice(1))
      : `if (isColliding) setTurn(0.1)`
  );
  reset();
};
window.addEventListener('hashchange', hashChange);

hashChange();
loop();
