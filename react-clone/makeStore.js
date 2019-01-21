'use strict';

export const makeStore = ({reducer, onchange}) => {
  let state;

  const dispatch = (type, payload) => {
    state = reducer(type)(payload)(state);
    onchange(dispatch, state);
    console.log(type, payload, state);
  };

  dispatch('init');
};
