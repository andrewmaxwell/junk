// node headacheChart/processIcs

import fs from 'fs';

const data = fs.readFileSync(
  '/Users/andrew.maxwell/Downloads/emailandrewmaxwell@gmail.com.ical/emailandrewmaxwell@gmail.com.ics',
  'utf-8',
);

const processed = data
  .split('END:VEVENT')
  .map((str) =>
    Object.fromEntries(str.split('\r\n').map((line) => line.split(':'))),
  )
  .filter((o) => /headache/i.test(o.SUMMARY))
  .map((o) => o.DTSTART)
  .sort()
  .map((d) =>
    d.replace(
      /(\d\d\d\d)(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/,
      '$1-$2-$3T$4:$5:$6.000Z',
    ),
  )
  .join('\n');

console.log(processed);
fs.writeFileSync('headacheChart/headaches.txt', processed);
