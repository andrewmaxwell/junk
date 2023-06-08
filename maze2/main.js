import {makeMaze} from './makeMaze.js';

document.body.innerHTML = makeMaze(100, 100)
  .map((r) => {
    const row = r.map((c) => (c ? '<i></i>' : '<b></b>')).join('');
    return `<div>${row}</div>`;
  })
  .join('');
