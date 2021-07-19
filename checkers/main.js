import {getNextStates, initialState, printBoard} from './checkers.js';
import {minimax} from './minimax.js';

// const addWatcher = (func) => {
//   func.resetStats = () => {
//     if (func.stats) console.log(func.name, func.stats);
//     func.stats = {count: 0, ms: 0};
//   };
//   func.resetStats();
//   return (...args) => {
//     const start = Date.now();
//     const result = func(...args);
//     func.stats.ms += Date.now() - start;
//     func.stats.count++;
//     return result;
//   };
// };

const getBoardValue = minimax(getNextStates);

const randomMove = (state) => {
  const n = getNextStates(state);
  return n[Math.floor(Math.random() * n.length)];
};

// const stupidMove = (state) => getNextStates(state)[0];

const smartMove = (state) =>
  getNextStates(state)
    .map((s) => ({s, v: getBoardValue(s, 10)}))
    .reduce((max, el) => (el.v > max.v ? el : max)).s;

let state = initialState;

const loop = () => {
  console.time();
  if (state.turn === 'b') {
    state = randomMove(state);
  } else {
    state = smartMove(state);
    // getNextStates.resetStats();
  }
  console.timeEnd();
  if (!state) return;
  printBoard(state);
  setTimeout(loop, 500);
};

loop();

// [initialState, ...getNextStates(initialState)].forEach((s) => {
//   console.log(boardValue(s));
//   printBoard(s);
// });
