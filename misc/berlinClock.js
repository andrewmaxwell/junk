const berlinClock = (time) => {
  const [hours, mins, secs] = time.split(':').map(Number);
  return [
    secs % 2 ? 'O' : 'Y',
    'R'.repeat(hours / 5).padEnd(4, 'O'),
    'R'.repeat(hours % 5).padEnd(4, 'O'),
    [...'YYRYYRYYRYY']
      .map((v, i) => (i < Math.floor(mins / 5) ? v : 'O'))
      .join(''),
    'Y'.repeat(mins % 5).padEnd(4, 'O'),
  ].join('\n');
};

import {Test} from './test';
Test.assertSimilar(berlinClock('12:56:01'), 'O\nRROO\nRROO\nYYRYYRYYRYY\nYOOO');

Test.assertSimilar(berlinClock('00:00:00'), 'Y\nOOOO\nOOOO\nOOOOOOOOOOO\nOOOO');

Test.assertSimilar(berlinClock('22:32:45'), 'O\nRRRR\nRROO\nYYRYYROOOOO\nYYOO');
