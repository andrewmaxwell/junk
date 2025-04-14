import {component} from './component.js';
import {init} from './microframework.js';

// const overPath = (path, func, data) => {
//   if (!path.length) return func(data);
//   const result = Array.isArray(data) ? [...data] : {...data};
//   result[path[0]] = overPath(path.slice(1), func, data[path[0]]);
//   return result;
// };

const todoItem = (onClick) => component`
  <li>
    <input
      type="checkbox"
      checked=${(item) => item.completed}
      onClick=${onClick}
    />
    <span style=${(item) => (item.completed ? 'text-decoration: line-through' : '')}>
      ${(item) => item.text}
    </span>
  </li>`;

// TODO: I don't like this
const getTodos = (state) =>
  state.todos.map((t) =>
    todoItem((state) => ({
      ...state,
      todos: state.todos.map((d) =>
        t === d ? {...d, completed: !d.completed} : d,
      ),
    }))(t),
  );

const app = component`
  <div style="font-family: sans-serif">
    <h1>Todo List</h1>
    <input 
      placeholder="Enter a todo item" 
      style="font-size: 1em; padding: 5px" 
      value=${(state) => state.inputValue} 
      onChange=${(state, e) => ({...state, inputValue: e.target.value})}
    />
    <button 
      style="font-size: 1em; padding: 5px" 
      disabled=${(state) => !state.inputValue} 
      onClick=${(state) => ({
        ...state,
        inputValue: '',
        todos: [{text: state.inputValue, completed: false}, ...state.todos],
      })}
    >Add</button>
    <ul style="listStyleType: none; padding: 0; margin-top: 20px">
      ${getTodos}
    </ul>
    <pre>${(state) => JSON.stringify(state, null, 2)}</pre>
  </div>`;

const initialState = {
  inputValue: '',
  todos: [
    {text: 'make a todo list', completed: true},
    {text: 'add more features', completed: false},
  ],
};

init(app, initialState, document.querySelector('#root'));
