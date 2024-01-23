import {draw} from './draw.js';
import {getData} from './getData.js';

const calc = ({people: peopleRows, attendance}) => {
  const people = peopleRows.map(({id, Name}) => ({
    id: +id,
    name: Name,
    score: 0,
    positions: [],
  }));

  const peopleIndex = Object.fromEntries(people.map((p) => [p.id, p]));
  for (let i = 0; i < attendance.length; i++) {
    for (const id of attendance[i].ids.split(',')) {
      if (peopleIndex[id]) peopleIndex[id].last = i;
    }
  }

  const now = Date.now();
  const msInWeek = 7 * 24 * 3600 * 1000;

  for (let i = 0; i < attendance.length; i++) {
    const ids = new Set(attendance[i].ids.split(',').map(Number));

    const amt = 0.95 ** ((now - Date.parse(attendance[i].date)) / msInWeek);

    for (const p of people) {
      if (ids.has(p.id)) p.score += amt;
    }

    people
      .filter(
        (a) =>
          a.score &&
          (a.last >= i || Math.min(i, a.last) > attendance.length - 6)
      )
      .sort((a, b) => b.score - a.score)
      .forEach((p, j) => {
        p.positions.push({x: j, y: i, present: ids.has(p.id)});
      });
  }

  return {people, attendance};
};

draw(calc(await getData()));
