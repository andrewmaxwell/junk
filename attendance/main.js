import {draw} from './draw.js';
import {getData} from './getData.js';

const now = Date.now();
const msInWeek = 7 * 24 * 3600 * 1000;

const setLast = (people, attendance) => {
  const peopleIndex = Object.fromEntries(people.map((p) => [p.id, p]));
  for (let i = 0; i < attendance.length; i++) {
    for (const id of attendance[i].ids.split(',')) {
      if (peopleIndex[id]) peopleIndex[id].last = i;
    }
  }
};

const setPositionsForWeek = (people, {ids, date}, weekIndex, numWeeks) => {
  ids = new Set(ids.split(',').map(Number));

  const amt = 0.95 ** ((now - Date.parse(date)) / msInWeek);

  for (const p of people) {
    if (ids.has(p.id)) p.score += amt;
  }

  const weekPeople = people
    .filter(
      (a) =>
        a.score &&
        (a.last >= weekIndex || Math.min(weekIndex, a.last) > numWeeks - 6)
    )
    .sort((a, b) => b.score - a.score);

  weekPeople.forEach((p, j) => {
    p.positions.push({x: weekIndex, y: j, present: ids.has(p.id)});
  });
};

const calc = ({people: peopleRows, attendance}) => {
  const people = peopleRows.map(({id, Name}) => ({
    id: +id,
    name: Name,
    score: 0,
    positions: [],
  }));

  setLast(people, attendance);

  for (let i = 0; i < attendance.length; i++) {
    setPositionsForWeek(people, attendance[i], i, attendance.length);
  }

  return {people, attendance};
};

draw(calc(await getData()));
