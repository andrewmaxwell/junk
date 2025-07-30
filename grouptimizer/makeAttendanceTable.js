const now = Date.now();
const msInWeek = 7 * 24 * 3600 * 1000;

/** @import {Person} from './solver.js' */
/** @param {Person[]} people */
export const makeAttendanceTable = (people) => {
  const peopleWithWeeks = people.map((p) => ({
    ...p,
    weeks: p.dates
      .map((date) => ({
        date,
        weeksAgo: Math.round((now - date.getTime()) / msInWeek),
      }))
      .reverse(),
  }));

  const cols = [
    ...new Set(peopleWithWeeks.flatMap((p) => p.weeks.map((w) => w.weeksAgo))),
  ].sort((a, b) => a - b);

  console.log(peopleWithWeeks);

  return peopleWithWeeks
    .sort((a, b) => b.score - a.score)
    .map(({name, weeks}) => {
      const weekIndex = Object.fromEntries(
        weeks.map((w) => [w.weeksAgo, w.date]),
      );
      const weekCells = cols.map(
        (w) =>
          `<td class="${weekIndex[w] ? 'present' : 'absent'}" title="${
            weekIndex[w]?.toLocaleDateString() || ''
          }"/>`,
      );

      return `
        <tr>
          <td>${name}<td>
          ${weekCells.join('')}
        </tr>`;
    })
    .join('');
};
