import {TYPES, SPRITE_SIZE} from './consts.js';
import {drawSprite} from './renderer.js';

const debounce = (func, ms) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), ms);
  };
};

export const initEditor = ({game, canvas, renderer, reset}) => {
  let editMode = false;
  let currentType = TYPES.EMPTY;
  let level = 0;

  const saveToHash = debounce(() => {
    location.hash = game.toHash();
  }, 500);

  const addItem = (e) => {
    if (!editMode) return;
    const x = Math.floor(e.offsetX / SPRITE_SIZE);
    const y = Math.floor(e.offsetY / SPRITE_SIZE);
    game.setCell(x, y, currentType);
    renderer.draw(game);
    saveToHash();
  };
  canvas.addEventListener('mousemove', (e) => {
    if (!editMode) return;
    if (e.which === 1) addItem(e);
    else {
      renderer.draw(game);
      renderer.drawGhost(e, game.tankDir, currentType);
    }
  });
  canvas.addEventListener('click', addItem);
  window.addEventListener('hashchange', reset);

  // prevent space from clicking buttons
  window.addEventListener('keyup', (e) => {
    e.preventDefault();
  });

  Object.values(TYPES).forEach((type) => {
    const button = document.createElement('canvas');
    button.width = SPRITE_SIZE;
    button.height = SPRITE_SIZE;
    drawSprite(button.getContext('2d'), 0, {x: 0, y: 0, type}, game.tankDir);
    button.addEventListener('click', () => {
      currentType = type;
      document.querySelectorAll('.selected').forEach((s) => {
        s.classList.remove('selected');
      });
      button.classList.add('selected');
    });
    if (type == currentType) button.classList.add('selected');
    window.buttons.append(button);
  });

  window.doneButton.addEventListener('click', () => {
    editMode = false;
    window.editButton.style.display = 'block';
    window.editor.style.display = 'none';
  });

  window.editButton.addEventListener('click', () => {
    editMode = true;
    window.editButton.style.display = 'none';
    window.editor.style.display = 'block';
  });

  window.clearButton.addEventListener('click', () => {
    location.hash = '111';
  });

  const levels = [
    '1772F7', // flag
    '2F74B04B14B24B34B44B54B64B74B84B94BA4BB4BC4BD4BE4BF177359', // water and block
    '2F74B04B14B24B34B44B54B64B74B84B94BA4BB4BC4BD4BE4BF177359F90IDF', // turrets
    '2F74B04B14B24B34B44B54B64B74B84B94BA4BB4BC4BD4BE4BF177359F90IDF6A0JNFMN1J9F', // mirrors
    '2F74B04B14B24B34B44B54B64B74B84B94BA4BB4BC4BD4BE4BF8D98D88D68D7BD5BE5BF5BG59H69H59H79H8AH9AG9AF9AE9177359F90IDF6A0JNFMN1J9F355', // belts
    '2F74B04B14B24B34B44B54B64B74B84B94BA4BB4BC4BD4BE4BF8D98D88D68D7BD5BE5BF5BG59H69H59H79H8AH9AG9AF9AE94CF4CE4CD4CB4CA4C94C84C74C64C54C44C34C24C04C1ECCDDCDECDFCDGCDHCDDBDDADEADFADGADHADHBDGBDFBDEBDDDDDEDEDDFDDGDDHDDHEDHFDGFDFFDEFDEEDFEDGE4I94J94K94L94M9177359F90IDF6A0J9F3554N9', // ice
  ];

  window.nextButton.addEventListener('click', () => {
    level = (level + 1) % levels.length;
    location.hash = levels[level];
  });
  window.prevButton.addEventListener('click', () => {
    level = (level - 1 + levels.length) % levels.length;
    location.hash = levels[level];
  });
  if (location.hash.slice(1)) reset();
  else location.hash = levels[level];
};
