const weeksAgo = (date) => Math.round((Date.now() - date) / (7 * 24 * 3600000));

const processAttendance = (attendanceHistory, people) => {
  const personIndex = Object.fromEntries(people.map((p) => [p.id, p]));
  const result = Object.entries(attendanceHistory)
    .map(([dateStr, arr]) => ({
      date: new Date(dateStr),
      people: arr
        .split(',')
        .map((n) => personIndex[n])
        .filter((i) => i),
    }))
    .sort((a, b) => a.date - b.date);

  for (const {date, people} of result) {
    for (const p of people) {
      p.lastPresent = date;
    }
  }
  return result;
};

const intersect = (a, b) => {
  const s = new Set(a);
  return b.filter((x) => s.has(x));
};

const nameList = (people) =>
  people
    .map((p) => p.name)
    .sort()
    .join(', ');

const getNewStudentNames = (attendanceHistory, minDaysAgo, maxDaysAgo) => {
  const minTime = Date.now() - minDaysAgo * 24 * 3600000;
  const maxTime = Date.now() - maxDaysAgo * 24 * 3600000;
  const past = new Set();
  const recent = new Set();
  console.log('attendanceHistory', attendanceHistory);
  for (const {date, people} of attendanceHistory) {
    if (date < maxTime) continue;
    const arr = date < minTime ? past : recent;
    for (const p of people) arr.add(p);
  }
  return nameList([...recent].filter((p) => !p.sponsor && !past.has(p)));
};

const processAbsences = (people) => {
  const acc = {};
  for (const p of people) {
    const w = weeksAgo(p.lastPresent);
    if (w) (acc[w] = acc[w] || []).push(p);
  }
  return Object.entries(acc)
    .sort((a, b) => a[0] - b[0])
    .map(([i, w]) => `Absent ${i} week${i == 1 ? '' : 's'}: ${nameList(w)}`)
    .join('\n');
};

export const makeReport = (people, attendanceHistory) => {
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

  attendanceHistory = processAttendance(attendanceHistory, people);

  const newStudentsThisWeek = getNewStudentNames(attendanceHistory, 7, 60);
  const absences = processAbsences(people.filter((p) => !p.sponsor));

  return `
Sponsors: ${sponsors.length}
Students: ${students.length}
High Schoolers: ${highsSchoolers.length}
Middle Schoolers: ${middleSchoolers.length}
Boys: ${boys.length}
Girls: ${girls.length}

Sponsors: ${sponsorNames}
High School Boys: ${highSchoolBoys}
High School Girls: ${highSchoolGirls}
Middle School Boys: ${middleSchoolBoys}
Middle School Girls: ${middleSchoolGirls}

New students this week: ${newStudentsThisWeek || 'None'}
${absences}`.trim();
};
