// http://127.0.0.1:8080/roomba/#Y29uc3QgcmFkID0gMjA7CgppZiAoIWRhdGEubWFwKSB7CiAgICBkYXRhLm1hcCA9IFtdOwp9Cgpjb25zdCB7bWFwfSA9IGRhdGE7CmNvbnN0IGdldCA9ICh4LCB5KSA9PiAobWFwW3ldIHx8IFtdKVt4XTsKY29uc3Qgc2V0ID0gKHgsIHksIHYpID0+IChtYXBbeV0gPSBtYXBbeV0gfHwgW10pW3hdID0gdjsKCi8vIHVwZGF0ZSBpbnRlcm5hbCBtYXAKZm9yIChsZXQgaSA9IHggLSByYWQ7IGkgPD0geCArIHJhZDsgaSsrKSB7CiAgICBmb3IgKGxldCBqID0geSAtIHJhZDsgaiA8PSB5ICsgcmFkOyBqKyspIHsKICAgICAgICBjb25zdCBzcURpc3QgPSAoaSAtIHgpICoqIDIgKyAoaiAtIHkpICoqIDI7CiAgICAgICAgaWYgKHNxRGlzdCA+IHJhZCAqKiAyKSBjb250aW51ZTsKICAgICAgICBpZiAoaXNDb2xsaWRpbmcgJiYgc3FEaXN0IDwgMjUpIHNldChpLCBqLCAtMSk7CiAgICAgICAgZWxzZSBpZiAoIWdldChpLCBqKSkgc2V0KGksIGosIDEpOwogICAgfQp9Cgpjb25zdCBjdXJyZW50QW5nbGUgPSBNYXRoLmF0YW4yKHkgLSBkYXRhLnByZXZZLCB4IC0gZGF0YS5wcmV2WCk7CmlmIChpc05hTihjdXJyZW50QW5nbGUpKSByZXR1cm47CgovLyBmaW5kIHBhdGggdG8gY2xvc2VzdCB1bnZpc2l0ZWQgc3BvdApjb25zdCBkaXJzID0gW1sxLCAwXSwgWzAsIDFdLCBbLTEsIDBdLCBbMCwgLTFdXTsKY29uc3QgcSA9IFt7eDogTWF0aC5yb3VuZCh4KSwgeTogTWF0aC5yb3VuZCh5KX1dOwpjb25zdCBpblEgPSB7W3FbMF0ueCArICcsJyArIHFbMF0ueV06IHRydWV9OwoKZm9yIChjb25zdCBjIG9mIHEpIHsKICAgIGZvciAoY29uc3QgW2R4LCBkeV0gb2YgZGlycykgewogICAgICAgIGNvbnN0IG4gPSB7eDogYy54ICsgZHgsIHk6IGMueSArIGR5fTsKICAgICAgICBjb25zdCB2ID0gZ2V0KG4ueCwgbi55KTsKICAgICAgICBpZiAoIXYpIHsKICAgICAgICAgICAgLy8gY29uc3QgcGF0aCA9IFtjXTsKICAgICAgICAgICAgLy8gbGV0IHcgPSBjOwogICAgICAgICAgICAvLyB3aGlsZSAodyA9IHcucHJldikgewogICAgICAgICAgICAvLyAgICAgcGF0aC5wdXNoKHcpOwogICAgICAgICAgICAvLyB9CiAgICAgICAgICAgIC8vIGRhdGEucGF0aCA9IHBhdGg7CiAgICAgICAgICAgIGxldCB3ID0gYzsKICAgICAgICAgICAgd2hpbGUgKHcgPSB3LnByZXYpIHsKICAgICAgICAgICAgICAgIGlmICgody54IC0geCkgKiogMiArICh3LnkgLSB5KSAqKiAyIDwgcmFkICoqIDIpIHsKICAgICAgICAgICAgICAgICAgICB0dXJuKE1hdGguYXRhbjIoeSAtIHcueSwgeCAtIHcueCkgLSBjdXJyZW50QW5nbGUpOwogICAgICAgICAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIGNvbnN0IGtleSA9IG4ueCArICcsJyArIG4ueTsKICAgICAgICBpZiAodiA9PT0gMSAmJiAhKGtleSBpbiBpblEpKSB7CiAgICAgICAgICAgIGluUVtrZXldID0gdHJ1ZTsKICAgICAgICAgICAgbi5wcmV2ID0gYzsKICAgICAgICAgICAgcS5wdXNoKG4pOwogICAgICAgIH0KICAgIH0KfQoKZGF0YS5wcmV2WCA9IHg7CmRhdGEucHJldlkgPSB5Owo=

import {calcScore} from './calcScore/calcScore.js';
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
      : `if (isColliding) turn(0.1)`
  );
  reset();
};
window.addEventListener('hashchange', hashChange);

hashChange();
loop();
