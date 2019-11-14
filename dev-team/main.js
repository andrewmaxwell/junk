import {makeStore} from '../react-clone/makeStore.js';
import {reducer} from './reducer.js';
import {render} from './render.js';
import {saveToLocationHash} from './utils.js';

const dispatch = makeStore({
  reducer,
  onchange: (dispatch, state) => {
    saveToLocationHash(state);
    render(dispatch, state);
  }
});

window.addEventListener('keypress', e => {
  if (e.code === 'Space') dispatch('iterate');
});
