import {draw} from './draw.js';
import {getData} from './getData.js';

const now = Date.now();
const msInWeek = 7 * 24 * 3600 * 1000;

/**
 * @import {Person, Week} from './draw.js'
 * @type {(people: Person[], week: Week, weekIndex: number, numWeeks: number) => void}
 */
const setPositionsForWeek = (people, {ids, date}, weekIndex, numWeeks) => {
  const idSet = new Set(ids.split(',').map(Number));

  const amt = 0.95 ** ((now - date.getTime()) / msInWeek);

  for (const p of people) {
    if (idSet.has(p.id)) p.score += amt;
  }

  const weekPeople = people
    .filter(
      (a) =>
        a.score &&
        // don't include people who stopped coming unless they've been here in the past 6 weeks
        (a.last >= weekIndex || Math.min(weekIndex, a.last) > numWeeks - 6),
    )
    .sort((a, b) => b.score - a.score);

  weekPeople.forEach((p, j) => {
    p.positions.push({x: weekIndex, y: j, present: idSet.has(p.id)});
  });
};

/**
 * @param {{
 *  people: Array<{id: string, Name: string}>,
 *  attendance: Array<Week>
 * }} config */
const calc = ({people: peopleRows, attendance}) => {
  /** @type {Person[]} */
  const people = peopleRows.map(({id, Name}) => ({
    id: +id,
    name: Name,
    score: 0,
    positions: [],
    last: -1,
  }));

  const peopleIndex = Object.fromEntries(people.map((p) => [p.id, p]));

  for (let i = 0; i < attendance.length; i++) {
    for (const id of attendance[i].ids.split(',')) {
      if (peopleIndex[id]) peopleIndex[id].last = i;
    }
  }

  for (let i = 0; i < attendance.length; i++) {
    setPositionsForWeek(people, attendance[i], i, attendance.length);
  }

  return {people, attendance};
};

draw(calc(await getData()));
