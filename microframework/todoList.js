import {init} from './framework.js';

/**
 *
 * @param {string} tag
 * @param {Record<string, any>} props
 * @param  {...any} children
 */
const h = (tag, props, ...children) => ({tag, props, children});

init({
  root: document.querySelector('#root'),
  initialState: {
    text: '',
    /** @type {Array<{id: number, text: string, done: boolean}>} */
    todos: JSON.parse(localStorage.microfw_todos_v1 || '[]'), // load
  },
  component: ({text, todos}, setState) => {
    localStorage.microfw_todos_v1 = JSON.stringify(todos); // save

    const addTodo = () => {
      if (!text.trim()) return;
      setState((s) => ({
        text: '',
        todos: [...s.todos, {id: Date.now(), text: s.text, done: false}],
      }));
    };

    /** @type {(id: number) => void} */
    const toggle = (id) =>
      setState((s) => ({
        todos: s.todos.map((t) => (t.id === id ? {...t, done: !t.done} : t)),
      }));

    /** @type {(id: number) => void} */
    const del = (id) =>
      setState((s) => ({todos: s.todos.filter((t) => t.id !== id)}));

    /** @type {(id: number) => void} */
    const edit = (id) => {
      const current = todos.find((t) => t.id === id);
      const updated = prompt('Edit todo:', current?.text);
      if (updated != null) {
        setState((s) => ({
          todos: s.todos.map((t) => (t.id === id ? {...t, text: updated} : t)),
        }));
      }
    };

    /** @type {(id: number, dir: number) => void} */
    const move = (id, dir) =>
      setState((s) => {
        const idx = s.todos.findIndex((t) => t.id === id);
        const nxt = idx + dir;
        if (nxt < 0 || nxt >= s.todos.length) return {};
        const arr = [...s.todos];
        [arr[idx], arr[nxt]] = [arr[nxt], arr[idx]];
        return {todos: arr};
      });

    return h(
      'div',
      {},
      h('input', {
        type: 'text',
        value: text,
        oninput: (e) => setState(() => ({text: e.target.value})),
        onkeydown: (e) => {
          if (e.key === 'Enter') addTodo();
        },
        placeholder: 'New todo…',
      }),
      h('button', {onclick: addTodo}, 'Add'),
      h(
        'ul',
        {},
        ...todos.map((t) =>
          h(
            'li',
            {class: t.done ? 'done' : ''},
            h('input', {
              type: 'checkbox',
              checked: t.done,
              onchange: () => toggle(t.id),
            }),
            ' ',
            t.text,
            h('button', {onclick: () => edit(t.id)}, 'Edit'),
            h('button', {onclick: () => move(t.id, -1)}, '↑'),
            h('button', {onclick: () => move(t.id, 1)}, '↓'),
            h('button', {onclick: () => del(t.id)}, '✕'),
          ),
        ),
      ),
    );
  },
});
