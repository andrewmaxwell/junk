import {addChart} from './addChart.js';
import {getData} from './getData.js';

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

// console.log(
//   data
//     .filter((d) => d.time > Date.parse('2024/01/01'))
//     .map(
//       (d) =>
//         `${d.tstamp.split(' ')[0]}: ${d.notes}(energy: ${d.energy}/5, mood: ${d.mood}/5, exercise: ${d.exercise}/5)`,
//     )
//     .join('\n'),
// );

const minX = data[0].time;
const maxX = data[data.length - 1].time;

const render = () => {
  document.querySelector('#container').innerHTML = '';
  for (let i = 0; i < graphs.length; i++) {
    const {key, color} = graphs[i];
    addChart({data, key, color, i, minX, maxX, graphs});
  }
};

render();

window.addEventListener('resize', render);
