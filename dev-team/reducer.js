import {columns, initialState} from './constants.js';
import {fromLocationHash} from './utils.js';

export const reducer = propOr(always(identity), __, {
  init: () => () => fromLocationHash() || initialState,
  reset: always(always(initialState)),
  assign: ({pid, tid}) => state =>
    over(
      lensProp('tasks'),
      map(when(propEq('id', tid), mergeLeft({assignedTo: pid, progress: 0}))),
      state
    ),
  newTask: pipe(
    mergeLeft({column: 'analyze'}),
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
                t.column
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
                over(lensProp('column'), t => {
                  const index = columns.indexOf(t);
                  return columns[index + 1];
                })
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
