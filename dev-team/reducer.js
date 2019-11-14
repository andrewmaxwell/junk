import {columns, initialState} from './constants.js';
import {fromLocationHash} from './utils.js';

export const reducer = propOr(always(identity), __, {
  init: always(fromLocationHash || always(initialState)),
  assign: ({pid, tid}) => state =>
    over(
      lensProp('tasks'),
      map(when(propEq('id', tid), mergeLeft({assignedTo: pid, progress: 0}))),
      state
    ),
  newTask: pipe(
    mergeLeft({type: 'analyze'}),
    append,
    over(lensProp('tasks'))
  ),
  newPerson: pipe(
    append,
    over(lensProp('people'))
  ),
  iterate: () => state =>
    pipe(
      over(
        lensProp('tasks'),
        map(
          pipe(
            when(prop('assignedTo'), t => {
              const skillLevel = state.people.find(p => p.id === t.assignedTo)[
                t.type
              ];
              return over(
                lensProp('progress'),
                add(skillLevel / t.estimate),
                t
              );
            }),
            when(
              propSatisfies(gte(__, 0.99), 'progress'),
              pipe(
                omit(['progress', 'assignedTo']),
                over(lensProp('type'), t => columns[columns.indexOf(t) + 1])
              )
            )
          )
        )
      )
    )(state),
  upgrade: ({id, type}) =>
    over(
      lensProp('people'),
      map(when(propEq('id', id), over(lensProp(type), multiply(1.1))))
    )
});
