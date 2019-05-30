const {
  Redux,
  React,
  ReactDOM,
  R: {
    pipe,
    over,
    lensProp,
    multiply,
    add,
    always,
    identity,
    is,
    assoc,
    cond,
    propEq,
    T,
    mergeLeft,
    when,
    prop,
    converge,
    subtract,
    divide
  }
} = window;

const App = ({display, op, dispatch}) => (
  <div>
    <h1>{display}</h1>
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, '+', '-', '*', '/', '='].map(i => (
      <button
        key={i}
        className={op === i ? 'highlight' : ''}
        onClick={() =>
          dispatch({
            type: is(Number, i) ? 'pressNumber' : 'pressOperator',
            payload: i
          })
        }
      >
        {i}
      </button>
    ))}
  </div>
);

const math = (op, func) => [
  propEq('op', op),
  converge(assoc('display'), [
    converge(func, [prop('prev'), prop('display')]),
    identity
  ])
];

const evaluate = pipe(
  cond([
    math('+', add),
    math('-', subtract),
    math('*', multiply),
    math('/', divide),
    [T, identity]
  ]),
  assoc('prev', 0)
);

const reducers = {
  pressNumber: val =>
    pipe(
      when(
        prop('newNumber'),
        pipe(
          converge(assoc('prev'), [prop('display'), identity]),
          mergeLeft({newNumber: false, display: 0})
        )
      ),
      over(
        lensProp('display'),
        pipe(
          multiply(10),
          add(Number(val))
        )
      )
    ),
  pressOperator: op =>
    pipe(
      evaluate,
      mergeLeft({op, newNumber: true})
    )
};

const defaultState = {display: 0, prev: 0};

const reducer = (state = defaultState, {type, payload}) =>
  (reducers[type] || always(identity))(payload)(state);

const init = () => {
  const store = Redux.createStore(reducer);

  store.subscribe(() => {
    ReactDOM.render(
      <App {...store.getState()} dispatch={store.dispatch} />,
      document.getElementById('root')
    );
  });

  store.dispatch({type: 'init'});
};

init();
