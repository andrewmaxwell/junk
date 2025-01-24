const addYear = (date) => date.setFullYear(date.getFullYear() + 1);

const numYears = (ms) => ms / (365 * 24 * 3600000);

const isAnadrome = (a, b) => a.toString().split('').reverse().join('') == b;

const anadromeAge = (older, younger) => {
  const maxDate = new Date().setFullYear(2100);

  for (let d = new Date(younger); d < maxDate; addYear(d)) {
    const youngerAge = Math.floor(numYears(d - younger));
    const olderAge = Math.floor(numYears(d - older));
    if (youngerAge === olderAge) break;
    if (isAnadrome(youngerAge, olderAge)) {
      console.log(d.toISOString().slice(0, 10), youngerAge, olderAge);
    }
  }

  for (let d = new Date(older); d < maxDate; addYear(d)) {
    const youngerAge = Math.floor(numYears(d - younger));
    const olderAge = Math.floor(numYears(d - older));
    if (youngerAge === olderAge) break;
    if (isAnadrome(youngerAge, olderAge)) {
      console.log(d.toISOString().slice(0, 10), youngerAge, olderAge);
    }
  }
};

const people = [
  {name: 'Mom', date: new Date('1961-06-12')},
  {name: 'Dad', date: new Date('1961-11-03')},
  {name: 'Nathan', date: new Date('1987-08-14')},
  {name: 'Andrea', date: new Date('1987-10-28')},
  {name: 'Andrew', date: new Date('1988-06-30')},
  {name: 'Mitch', date: new Date('1989-12-19')},
  {name: 'Marie', date: new Date('1990-03-20')},
  {name: 'Emily', date: new Date('1993-03-13')},
  {name: 'Josh', date: new Date('2000-04-27')},
  {name: 'Olaf', date: new Date('2000-08-14')},
  {name: 'Isla', date: new Date('2019-09-19')},
  {name: 'Eden', date: new Date('2021-09-14')},
  {name: 'Hugo', date: new Date('2022-12-21')},
  {name: 'Olive', date: new Date('2023-09-28')},
];

for (let i = 0; i < people.length; i++) {
  for (let j = i + 1; j < people.length; j++) {
    console.log('>', people[i].name, people[j].name);
    anadromeAge(people[i].date, people[j].date);
  }
}

// anadromeAge(new Date('1961-06-12'), new Date('1988-06-30'));
// anadromeAge(new Date('1961-06-12'), new Date('1993-03-13'));
