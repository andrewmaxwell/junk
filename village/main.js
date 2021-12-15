import {Unit, types} from './Unit.js';

let grid;

const reset = () => {
  grid = {};
  const mapping = {c: 'child', b: 'building', w: 'worker', f: 'crops'};
  `
wwwwwwwwwwbbbbwwwwwwwwwww
          cccc
  `
    .trim()
    .split('\n')
    .forEach((row, i) => {
      row.split('').forEach((val, j) => {
        if (mapping[val]) {
          new Unit(types[mapping[val]], 30 + j, 30 + i, grid);
        }
      });
    });
};

const getStats = (units) => {
  let totalFood = 0;
  let totalBuildings = 0;
  for (const u of units) {
    if (u.type == types.building) {
      totalFood += u.grain;
      totalBuildings++;
    }
  }
  return {totalFood, totalBuildings};
};

const statsDiv = document.querySelector('#stats');

const loop = () => {
  const units = Object.values(grid);
  const stats = getStats(units);

  statsDiv.innerText = `Food: ${stats.totalFood}\nBuildings: ${stats.totalBuildings}`;

  for (const u of units) {
    if (u.type.iterate) u.type.iterate(u, stats, units);
    u.el.innerText = u.grain || '';
  }

  setTimeout(loop, 100);
};

reset();
loop();
