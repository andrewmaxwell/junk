const intersect = (a, b) => {
  const s = new Set(a);
  return b.filter((x) => s.has(x));
};

const nameList = (a) =>
  a
    .map((p) => p.name)
    .sort()
    .join(', ');

export const makeReport = (people, history) => {
  const presentPeople = people.filter((p) => !p.absent);
  const sponsors = presentPeople.filter((p) => p.sponsor);
  const students = presentPeople.filter((p) => !p.sponsor);
  const girls = students.filter((p) => p.gender === 'f');
  const boys = students.filter((p) => p.gender === 'm');
  const highsSchoolers = students.filter((p) => p.grade >= 9);
  const middleSchoolers = students.filter((p) => p.grade < 9);

  const sponsorNames = nameList(sponsors);
  const highSchoolBoys = nameList(intersect(highsSchoolers, boys));
  const highSchoolGirls = nameList(intersect(highsSchoolers, girls));
  const middleSchoolBoys = nameList(intersect(middleSchoolers, boys));
  const middleSchoolGirls = nameList(intersect(middleSchoolers, girls));

  const personIndex = Object.fromEntries(people.map((p) => [p.id, p]));

  history = Object.entries(history)
    .map(([dateStr, arr]) => ({
      date: new Date(dateStr),
      people: arr
        .split(',')
        .map((n) => personIndex[n])
        .filter((i) => i),
    }))
    .sort((a, b) => a.date - b.date);

  console.log('history', history);

  const allPrevIds = new Set();
  const newStudentNames = nameList(
    presentPeople.filter((p) => !allPrevIds.has(p.id))
  );
  const absentStudentNames = '';

  return `
Sponsors: ${sponsors.length}
Students: ${students.length}
High Schoolers: ${highsSchoolers.length}
Middle Schoolers: ${middleSchoolers.length}
Boys: ${boys.length}
Girls: ${girls.length}
--------------------
New students: ${newStudentNames}
Absent this week: ${absentStudentNames}
Absent for 2 weeks:
Absent for 3 weeks:
---------------------------
Sponsors: ${sponsorNames}
High School Boys: ${highSchoolBoys}
High School Girls: ${highSchoolGirls}
Middle School Boys: ${middleSchoolBoys}
Middle School Girls: ${middleSchoolGirls}`.trim();
};
