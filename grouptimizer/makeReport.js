// If this is 1, then all weeks are equally valuable. It's it's 0.5, each week is worth half as much as the week after
const leaderboardWeight = 0.95;

const now = new Date();

/** @param {Date} date */
const weeksAgo = (date) =>
  Math.round((now.getTime() - date.getTime()) / (7 * 24 * 3600000));

/** @type {<T>(a: T[], b: T[]) => T[]} */
const intersect = (a, b) => {
  const s = new Set(a);
  return b.filter((x) => s.has(x));
};

/** @import {Person} from './solver.js' */
/** @param {Person[]} people */
const nameList = (people) =>
  people
    .map((p) => p.name)
    .sort()
    .join('\n');

/** @param {Person[]} people */
const processAbsences = (people) => {
  /** @type {Record<number, Person[]>} */
  const acc = {};
  for (const p of people) {
    const w = weeksAgo(p.dates[p.dates.length - 1]);
    if (w) (acc[w] ??= []).push(p);
  }
  return Object.entries(acc)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(
      ([i, w]) =>
        `Absent ${i} week${i === '1' ? '' : 's'}: (${w.length})\n${nameList(w)}\n`,
    )
    .join('\n');
};

const currentYear = now.getFullYear();
const currentMonth = now.getMonth(); // Jan = 0
const currentDay = now.getDate();

/** @param {Person[]} people */
const getBirthdays = (people) =>
  people
    .filter((p) => p.birthday)
    .map((p) => ({
      name: p.name,
      year: p.birthday.getFullYear(),
      month: p.birthday.getMonth(),
      day: p.birthday.getDate(),
    }))
    .sort((a, b) => a.month - b.month || a.day - b.day)
    .map(({name, year, month, day}) => {
      const past =
        month < currentMonth || (month === currentMonth && day < currentDay)
          ? '-- '
          : '';
      const bday = `${month + 1}/${day}/${year}`;
      const age = currentYear - year;
      return `${past}${bday}: ${name} (${age})`;
    })
    .join('\n');

const msInWeek = 7 * 24 * 3600 * 1000;

/** @param {Person[]} people */
const leaderboard = (people) =>
  people
    .map((p) => {
      p.score = 0;
      for (const date of p.dates) {
        p.score +=
          leaderboardWeight **
          Math.round((now.getTime() - date.getTime()) / msInWeek);
      }
      return p;
    })
    .filter((p) => p.score)
    .sort((a, b) => b.score - a.score)
    .map(
      (p, i) =>
        `${i + 1}. ${p.name} (${p.score.toLocaleString()}, ${p.dates.length})`,
    )
    .join('\n');

/** @param {Person[]} people */
export const makeReport = (people) => {
  const presentPeople = people.filter((p) => !p.absent);
  const sponsors = presentPeople.filter((p) => p.sponsor);
  const students = presentPeople.filter((p) => !p.sponsor);
  const girls = students.filter((p) => p.gender === 'f');
  const boys = students.filter((p) => p.gender === 'm');
  const highsSchoolers = students.filter((p) => p.grade >= 9);
  const middleSchoolers = students.filter((p) => p.grade < 9);

  const highSchoolBoys = intersect(highsSchoolers, boys);
  const highSchoolGirls = intersect(highsSchoolers, girls);
  const middleSchoolBoys = intersect(middleSchoolers, boys);
  const middleSchoolGirls = intersect(middleSchoolers, girls);

  const absences = processAbsences(people);

  return `
Students: ${students.length}
High Schoolers: ${highsSchoolers.length}
Middle Schoolers: ${middleSchoolers.length}
Boys: ${boys.length}
Girls: ${girls.length}

Sponsors (${sponsors.length}): 
${nameList(sponsors)}

High School Boys (${highSchoolBoys.length}): 
${nameList(highSchoolBoys)}

High School Girls (${highSchoolGirls.length}): 
${nameList(highSchoolGirls)}

Middle School Boys (${middleSchoolBoys.length}): 
${nameList(middleSchoolBoys)}

Middle School Girls (${middleSchoolGirls.length}): 
${nameList(middleSchoolGirls)}

${absences.trim()}

Attendance Leaderboard (each week present is worth ${
    leaderboardWeight * 100
  }% as much as the next one)
${leaderboard(people)}

Birthdays
${getBirthdays(people)}
`.trim();
};
