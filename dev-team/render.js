import {makeRenderer} from '../react-clone/makeRenderer.js';
import {columns} from './constants.js';
import {names} from './names.js';

const randName = () => names[Math.floor(Math.random() * names.length)];

const formatNum = n => Math.round(n * 100) / 100;

export const render = makeRenderer('body', ({tasks, people}) => [
  ...columns.map(type => ({
    attr: {style: 'margin: 5px; padding: 5px; float: left; width: 20%;'},
    children: [
      {tag: 'h3', attr: {style: 'text-transform: capitalize'}, text: type},
      ...tasks
        .filter(t => t.type === type)
        .map(({id: tid, estimate, assignedTo, progress}) => ({
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
              text:
                tid + (assignedTo ? ' ' + Math.round(100 * progress) + '%' : '')
            },
            {
              tag: 'span',
              text: assignedTo ? 'Assigned to ' + assignedTo : 'Assign to: '
            },
            ...(assignedTo ? [] : people)
              .filter(p => p[type])
              .map(({id: pid}) => ({
                tag: 'button',
                text: pid,
                attr: {
                  disabled: tasks.some(t => t.assignedTo === pid)
                },
                click: dispatch => dispatch('assign', {pid, tid})
              }))
          ]
        }))
    ]
  })),
  {css: {clear: 'both'}},
  {
    tag: 'button',
    text: 'New Task',
    click: dispatch =>
      dispatch('newTask', {
        id: 'Task ' + randName(),
        estimate: 1 + Math.floor(Math.random() * 7)
      })
  },
  {
    tag: 'button',
    text: 'New Analyst',
    click: dispatch =>
      dispatch('newPerson', {id: randName(), analyze: 1, dev: 0, test: 0})
  },
  {
    tag: 'button',
    text: 'New Dev',
    click: dispatch =>
      dispatch('newPerson', {id: randName(), analyze: 0, dev: 1, test: 0})
  },
  {
    tag: 'button',
    text: 'New Tester',
    click: dispatch =>
      dispatch('newPerson', {id: randName(), analyze: 0, dev: 0, test: 1})
  },
  {
    tag: 'button',
    text: 'Iterate',
    click: dispatch => dispatch('iterate')
  },
  ...people.map(p => ({
    attr: {style: 'margin: 15px; padding: 15px'},
    children: [
      {attr: {style: 'font-weight:bold'}, text: p.id},
      ...columns.slice(0, -1).map(type => ({
        children: [
          // {
          //   tag: 'button',
          //   text: 'Upgrade',
          //   click: dispatch => dispatch('upgrade', {id: p.id, type})
          // },
          {tag: 'span', text: `${type}: ${formatNum(p[type])}`}
        ]
      }))
      // {
      //   tag: 'button',
      //   text: 'Upgrade Analysis Skills',
      //   click: dispatch => dispatch('upgrade', {id, type: 'analyze'})
      // },
      // {tag: 'span', text: `, Dev: ${formatNum(dev)} `},
      // {
      //   tag: 'button',
      //   text: 'Upgrade Dev Skills',
      //   click: dispatch => dispatch('upgrade', {id, type: 'dev'})
      // },
      // {tag: 'span', text: `, Test: ${formatNum(test)} `},
      // {
      //   tag: 'button',
      //   text: 'Upgrade Testing Skills',
      //   click: dispatch => dispatch('upgrade', {id, type: 'test'})
      // }
    ]
  }))
]);
