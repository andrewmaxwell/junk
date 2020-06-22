const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const calendar = (year, month) => {
  const topLine = year + ' ' + months[month - 1];
  const date = new Date(year, month - 1);
  const startingDay = date.getDay();
  const numDays = (new Date(year, month) - date) / 864e5;
  let result =
    ' '.repeat(Math.floor((27 - topLine.length) / 2)) +
    topLine +
    '\nSUN MON TUE WED THU FRI SAT\n' +
    ' '.repeat(startingDay * 4);
  for (let i = 1; i <= numDays; i++) {
    result += ' ' + i;
    if (i !== numDays)
      result += (i + startingDay) % 7 ? ' '.repeat(3 - ('' + i).length) : '\n';
  }
  return result;
};

const {Test} = require('./test');
var answer = `        2016 August
SUN MON TUE WED THU FRI SAT
     1   2   3   4   5   6
 7   8   9   10  11  12  13
 14  15  16  17  18  19  20
 21  22  23  24  25  26  27
 28  29  30  31`;
Test.assertSimilar(calendar(2016, 8), answer);

answer = `       2016 February
SUN MON TUE WED THU FRI SAT
     1   2   3   4   5   6
 7   8   9   10  11  12  13
 14  15  16  17  18  19  20
 21  22  23  24  25  26  27
 28  29`;
Test.assertSimilar(calendar(2016, 2), answer);

answer = `       2022 January
SUN MON TUE WED THU FRI SAT
                         1
 2   3   4   5   6   7   8
 9   10  11  12  13  14  15
 16  17  18  19  20  21  22
 23  24  25  26  27  28  29
 30  31`;
Test.assertSimilar(calendar(2022, 1), answer);
