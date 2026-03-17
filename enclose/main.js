import {makeBFS} from './bfs.js';
import {makeRenderer} from './makeRenderer.js';

const board = [
  '...WWWWW...W.',
  'W............',
  'WW..WWWWW..W.',
  'WWW.W...W.WW.',
  'W...W...W.WWW',
  'W...WW.WW..WW',
  '.............',
  '.WW..H...WW..',
  'WWW....WWWW.W',
  'W...WW.WW....',
  '...WWW....WW.',
  '....WW...WWW.',
  'W..WWW....WW.',
  'WWWW.........',
  'W.W....WWWWWW',
];
const boardVals = [...board.join('')];

const startState = boardVals.map((p) => (p === 'H' ? 1 : 0));

const bfs = makeBFS({
  startState,
  stateToString: (s) => s.join(''),
  getNeighbors: (current) => {
    const result = [];
    // for each open cell, if it touches an enclosed cell, add to the queue a version with that cell enclosed
    for (let i = 0; i < current.length; i++) {
      if (current[i] || boardVals[i] === 'W') continue; // skip enclosed or W cells

      const x = i % width;
      const y = Math.floor(i / width);
      const isAdjacentToEnclosed =
        (x > 0 && current[i - 1]) ||
        (x < width - 1 && current[i + 1]) ||
        (y > 0 && current[i - width]) ||
        (y < height - 1 && current[i + width]);
      if (isAdjacentToEnclosed) {
        const next = [...current];
        next[i] = 1;
        result.push(next);
      }
    }
    return result;
  },
});

const width = board[0].length;
const height = board.length;
const draw = makeRenderer(width, height, boardVals);

const speed = 10;

const loop = () => {
  for (let s = 0; s < speed; s++) bfs.iterate();
  draw(bfs.queue[0], bfs.queue.length, bfs.seen.size);
  requestAnimationFrame(loop);
};

loop();
