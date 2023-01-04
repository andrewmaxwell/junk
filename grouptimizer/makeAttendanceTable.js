const now = Date.now();
const msInWeek = 7 * 24 * 3600 * 1000;

export const makeAttendanceTable = (people) => {
  for (const p of people) {
    p.weeks = p.dates
      .map((date) => ({date, weeksAgo: Math.round((now - date) / msInWeek)}))
      .reverse();
  }

  const cols = [
    ...new Set(people.flatMap((p) => p.weeks.map((w) => w.weeksAgo))),
  ].sort((a, b) => a - b);

  console.log(people);

  return people
    .sort(
      (a, b) =>
        // for (let i = 0; i < a.weeks.length && i < b.weeks.length; i++) {
        //   const diff = a.weeks[i].weeksAgo - b.weeks[i].weeksAgo;
        //   if (diff) return diff;
        // }
        // return b.weeks.length - a.weeks.length;
        b.score - a.score
    )
    .map(({name, weeks}) => {
      const weekIndex = Object.fromEntries(
        weeks.map((w) => [w.weeksAgo, w.date])
      );
      const weekCells = cols.map(
        (w) =>
          `<td class="${weekIndex[w] ? 'present' : 'absent'}" title="${
            weekIndex[w]?.toLocaleDateString() || ''
          }"/>`
      );

      return `
        <tr>
          <td>${name}<td>
          ${weekCells.join('')}
        </tr>`;
    })
    .join('');
};
