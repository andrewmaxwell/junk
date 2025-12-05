import {makeRenderer, makeGradient} from '../sand/makeRenderer.js';

/** @param {string} url */
const getJson = async (url) => {
  const data = await fetch(url).then((resp) => resp.json());
  const max = Math.max(...data);
  console.log('max', url, max);
  return data.map((v) => v / max);
};

const render = makeRenderer(
  /** @type {HTMLCanvasElement} */ (document.querySelector('canvas')),
  464,
  224,
  makeGradient([
    [0, 0, 0],
    [10, 15, 30],
    [21, 52, 110],
    [33, 97, 171],
    [38, 170, 226],
    [38, 198, 218],
    [46, 204, 113],
    [129, 199, 132],
    [174, 234, 0],
    [255, 213, 79],
    [255, 138, 101],
    [229, 57, 53],
  ]),
);

const scores = /** @type {number[]} */ (await getJson('comfort-scores.json'));

const dayTimeScores = /** @type {number[]} */ (
  await getJson('daytime-comfort-scores.json')
);

let frame = 0;
const loop = () => {
  render(frame % 2 === 0 ? scores : dayTimeScores);
  console.log(frame % 2 === 0 ? 'any time' : 'day time');
  frame++;
  setTimeout(loop, 1000);
};

loop();
