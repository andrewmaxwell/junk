import {makeDomUpdater} from './domUpdater.js';

const state = localStorage.persistedTodos
  ? JSON.parse(localStorage.persistedTodos)
  : {
      addInput: '',
      todos: [
        {text: 'do something', checked: false},
        {text: 'make a todo list', checked: true},
      ],
    };

const updateAndSave = () => {
  // eslint-disable-next-line no-use-before-define
  updateDOM();
  localStorage.persistedTodos = JSON.stringify(state);
};

const onsubmit = (e) => {
  e.preventDefault();
  if (!state.addInput.trim()) return;
  state.todos.push({text: state.addInput, checked: false});
  state.addInput = '';
  updateAndSave();
  document.querySelector('#addInput').focus();
};

const getIndex = (e) => Number(e.target.parentNode['data-index']);
const move = (dir) => (e) => {
  const t = state.todos;
  const i = getIndex(e);
  if (i + dir < 0) {
    t.push(t.shift());
  } else if (i + dir >= t.length) {
    t.unshift(t.pop());
  } else {
    [t[i], t[i + dir]] = [t[i + dir], t[i]];
  }
  updateAndSave();
};
const moveUp = move(-1);
const moveDown = move(1);

const remove = (e) => {
  state.todos.splice(getIndex(e), 1);
  updateAndSave();
};

const clearCompleted = () => {
  state.todos = state.todos.filter((t) => !t.checked);
  updateAndSave();
};

const onCheck = (e) => {
  state.todos[getIndex(e)].checked = !!e.target.checked;
  updateAndSave();
};

const onAddInput = (e) => {
  state.addInput = e.target.value;
  updateAndSave();
};

const onItemInput = (e) => {
  state.todos[getIndex(e)].text = e.target.value;
  updateAndSave();
};

const toView = () => ({
  tagName: 'div',
  children: [
    {tagName: 'h1', innerText: 'Todos'},
    {
      tagName: 'form',
      children: [
        {
          tagName: 'input',
          type: 'text',
          id: 'addInput',
          placeholder: 'What do you need to do?',
          size: 32,
          value: state.addInput,
          oninput: onAddInput,
        },
        {
          tagName: 'button',
          innerText: 'Add a Thing',
          disabled: state.addInput.trim() === '',
        },
      ],
      onsubmit,
    },
    {
      type: 'div',
      children: state.todos.map((t, i) => ({
        tagName: 'div',
        style: 'padding: 0 3px',
        'data-index': i,
        children: [
          {
            tagName: 'input',
            type: 'checkbox',
            checked: t.checked,
            onclick: onCheck,
          },
          {tagName: 'input', type: 'text', value: t.text, oninput: onItemInput},
          {
            tagName: 'button',
            innerText: '↑',
            className: 'itemButton',
            onclick: moveUp,
          },
          {
            tagName: 'button',
            innerText: '↓',
            className: 'itemButton',
            onclick: moveDown,
          },
          {
            tagName: 'button',
            innerText: 'x',
            className: 'itemButton',
            onclick: remove,
          },
        ],
      })),
    },
    {
      tagName: 'button',
      innerText: 'Clear Completed',
      onclick: clearCompleted,
      disabled: state.todos.every((t) => !t.checked),
    },
  ],
});

const updateDOM = makeDomUpdater(document.querySelector('#app'), toView);

updateAndSave();
