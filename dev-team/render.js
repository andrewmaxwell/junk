import {makeRenderer} from '../react-clone/makeRenderer.js';
import {columns} from './constants.js';
import {names} from './names.js';

const randName = () => names[Math.floor(Math.random() * names.length)];

const formatNum = n => Math.round(n * 100) / 100;

const button = (text, click, className = 'btn btn-link') => ({
  tag: 'button',
  attr: {type: 'button', class: className},
  text,
  click
});

const task = (tasks, people) => ({
  id: tid,
  estimate,
  assignedTo,
  progress
}) => ({
  attr: {
    style:
      'padding: 15px; margin: 15px 0; box-shadow: 2px 2px 5px rgba(0,0,0,0.2);'
  },
  children: [
    {
      attr: {style: 'float: right; font-size: 0.8em'},
      text: estimate + ' points'
    },
    {
      attr: {style: 'font-weight: bold'},
      text: tid + (assignedTo ? ' ' + Math.round(100 * progress) + '%' : '')
    },
    {
      tag: 'span',
      text: assignedTo ? 'Assigned to ' + assignedTo : 'Assign to: '
    },
    ...(assignedTo ? [] : people).map(({id: pid}) => ({
      tag: 'button',
      text: pid,
      attr: {
        class: 'btn btn-link',
        disabled: tasks.some(t => t.assignedTo === pid)
      },
      click: dispatch => dispatch('assign', {pid, tid})
    }))
  ]
});

export const render = makeRenderer('#root', ({tasks, people}) => [
  button('New Task', dispatch =>
    dispatch('newTask', {
      id: 'Task ' + randName(),
      estimate: 1 + Math.floor(Math.random() * 7)
    })
  ),
  button('Hire Generalist', dispatch =>
    dispatch('newPerson', {id: randName(), analyze: 1, dev: 1, test: 1})
  ),
  button('Hire Analyst', dispatch =>
    dispatch('newPerson', {id: randName(), analyze: 2, dev: 0, test: 0})
  ),
  button('Hire Dev', dispatch =>
    dispatch('newPerson', {id: randName(), analyze: 0, dev: 2, test: 0})
  ),
  button('Hire Tester', dispatch =>
    dispatch('newPerson', {id: randName(), analyze: 0, dev: 0, test: 2})
  ),
  button('Reset', dispatch => dispatch('reset')),
  button('Iterate', dispatch => dispatch('iterate'), 'btn btn-primary'),
  {
    attr: {class: 'row'},
    children: columns.map(column => ({
      attr: {class: 'col-sm'},
      children: [
        {tag: 'h3', attr: {style: 'text-transform: capitalize'}, text: column},
        {
          children: tasks
            .filter(propEq('column', column))
            .map(task(tasks, people.filter(prop(column))))
        }
      ]
    }))
  },
  {
    attr: {class: 'row'},
    children: people.map(p => {
      const workingOn = tasks.find(t => t.assignedTo === p.id);
      return {
        attr: {
          class: 'col-sm',
          style: workingOn ? 'color: gray' : ''
        },
        children: [
          {attr: {style: 'font-weight:bold'}, text: p.id},
          ...['analyze', 'dev', 'test'].map(column =>
            button(`${column}: ${formatNum(p[column])}`, dispatch =>
              dispatch('upgrade', {id: p.id, type: column})
            )
          ),
          {text: workingOn ? `Working on ${workingOn.id}` : ''}
        ]
      };
    })
  }
]);
