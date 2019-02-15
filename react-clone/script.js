import {makeStore} from './makeStore.js';
import {makeRenderer} from './makeRenderer.js';

const {
  assoc,
  over,
  lensProp,
  append,
  pipe,
  always,
  identity,
  assocPath,
  converge,
  lensPath,
  not,
  propOr,
  __,
  prop,
  remove
} = window.R;

const reducer = propOr(always(identity), __, {
  init: () =>
    always({
      items: [{text: 'make a thing'}],
      inputValue: 'abc'
    }),
  changeInput: assoc('inputValue'),
  addItem: () =>
    pipe(
      converge(
        (text, state) => over(lensProp('items'), append({text}), state),
        [prop('inputValue'), identity]
      ),
      assoc('inputValue', '')
    ),
  toggleCheck: index => over(lensPath(['items', index, 'checked']), not),
  toggleEdit: index => over(lensPath(['items', index, 'editing']), not),
  deleteItem: index => over(lensProp('items'), remove(index, 1)),
  editItem: ({value, index}) => assocPath(['items', index, 'text'], value)
});

const generateElements = ({inputValue, items}) => [
  {
    tag: 'h1',
    text: 'To Do List'
  },
  ...items.map(({checked, text, editing}, index) => ({
    tag: 'div',
    children: [
      {
        tag: 'input',
        attr: {
          type: 'checkbox',
          checked
        },
        click: dispatch => dispatch('toggleCheck', index)
      },
      editing
        ? {
            tag: 'input',
            val: text,
            keyup: (dispatch, e) =>
              dispatch('editItem', {value: e.target.value, index})
          }
        : {
            tag: 'span',
            css: {
              'text-decoration': checked ? 'line-through' : 'none'
            },
            text
          },
      {
        tag: 'button',
        text: editing ? 'done' : 'edit',
        click: dispatch => dispatch('toggleEdit', index)
      },
      {
        tag: 'button',
        text: 'delete',
        click: dispatch => dispatch('deleteItem', index)
      }
    ]
  })),
  {
    tag: 'input',
    keyup: (dispatch, e) => dispatch('changeInput', e.target.value),
    val: inputValue
  },
  {
    tag: 'button',
    click: dispatch => dispatch('addItem'),
    text: 'Add'
  }
];

makeStore({
  reducer,
  onchange: makeRenderer('body', generateElements)
});
