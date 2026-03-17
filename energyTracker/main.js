import { makeChart } from './addChart.js';
import { getData } from './getData.js';

const margin = 4;

/** @type {Array<{key: keyof import('./addChart.js').DataPoint, color: string}>} */
const graphs = [
  {key: 'energy', color: 'yellow'},
  {key: 'anxiety', color: 'magenta'},
  {key: 'headache', color: 'red'},
  {key: 'mood', color: 'green'},
  {key: 'exercise', color: 'cyan'},
  {key: 'temperature', color: 'orange'},
  {key: 'precipitation', color: 'blue'},
  {key: 'pressure', color: 'black'},
];

const data = await getData();
const width = 4 * data.length;

const minX = data[0].time;
const maxX = data[data.length - 1].time;
const container = /** @type {HTMLDivElement} */ (
  document.querySelector('#container')
);

const render = () => {
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < graphs.length; i++) {
    const {key, color} = graphs[i];
    const canvas = makeChart({
      data,
      key,
      color,
      minX,
      maxX,
      graphs,
      margin,
      width,
    });

    const label = document.createElement('div');
    label.innerText = key;
    Object.assign(label.style, {
      position: 'fixed',
      top: i * (canvas.height + margin) + 'px',
      left: '3px',
    });
    fragment.append(canvas, label);
  }
  container.appendChild(fragment);

  // scroll all the way to the right
  window.scrollTo(100000, 0);
};

render();

window.addEventListener('resize', render);
