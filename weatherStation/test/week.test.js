import test from 'node:test';
import assert from 'node:assert/strict';
import {weekSentence as clauses, partOfDay, fitWeek} from '../week.js';

// The full sentence, with room for all of it.
const weekSentence = (options) => fitWeek(clauses(options), () => true);

// Thursday Oct 29 2026, 4pm local.
const now = new Date(2026, 9, 29, 16);
const at = (day, hour) => new Date(2026, 9, 29 + day, hour);

// Hourly rows from now for ten days, dry and mild unless `edit` says otherwise.
function hours(edit = () => ({})) {
  const rows = [];
  for (let h = 0; h < 240; h++) {
    const time = new Date(now.getTime() + h * 3600_000);
    rows.push({
      time,
      temperature_2m: 55,
      precipitation_probability: 0,
      weather_code: 3,
      ...edit(time),
    });
  }
  return rows;
}
const flatDays = (his = []) =>
  Array.from({length: 10}, (_, k) => ({hi: his[k] ?? 70}));
const history = [{time: at(-1, 12), temperature_2m: 60}];
const wetBetween =
  (from, to, extra = {}) =>
  (time) =>
    time >= from && time < to
      ? {precipitation_probability: 70, weather_code: 61, ...extra}
      : {};

test('parts of the day speak like a forecast', () => {
  assert.equal(partOfDay(at(0, 18), now).words, 'this evening');
  assert.equal(partOfDay(at(0, 22), now).words, 'tonight');
  // The small hours belong to the night before.
  assert.equal(partOfDay(at(1, 2), now).words, 'tonight');
  assert.equal(partOfDay(at(1, 9), now).words, 'tomorrow morning');
  assert.equal(partOfDay(at(3, 14), now).words, 'Sun afternoon');
  assert.equal(partOfDay(at(4, 3), now).words, 'late Sun night');
  assert.equal(partOfDay(at(4, 22), now).words, 'Mon night');
});

test('a dry, steady week says so', () => {
  const upcoming = hours();
  assert.equal(
    weekSentence({history, upcoming, days: flatDays(), now}),
    'Dry through Mon',
  );
});

test('rain gets its start and end', () => {
  const upcoming = hours(wetBetween(at(3, 13), at(4, 22)));
  assert.equal(
    weekSentence({history, upcoming, days: flatDays(), now}),
    'Rain Sun afternoon into Mon night',
  );
  const sameDay = hours(wetBetween(at(3, 8), at(3, 20)));
  assert.equal(
    weekSentence({history, upcoming: sameDay, days: flatDays(), now}),
    'Rain Sun morning to evening',
  );
});

test('small hours into the morning are one early morning', () => {
  const upcoming = hours(wetBetween(at(3, 1), at(3, 10)));
  assert.equal(
    weekSentence({history, upcoming, days: flatDays(), now}),
    'Rain early Sun morning',
  );
});

test('rain already falling says when it stops', () => {
  const upcoming = hours(wetBetween(at(0, 0), at(0, 21)));
  assert.equal(
    weekSentence({history, upcoming, days: flatDays(), now}),
    'Rain till 9pm',
  );
});

test('scattered wet hours are one on-and-off spell', () => {
  const upcoming = hours((time) =>
    time >= at(3, 0) && time < at(6, 12) && time.getHours() % 4 === 0
      ? {precipitation_probability: 50, weather_code: 61}
      : {},
  );
  assert.equal(
    weekSentence({history, upcoming, days: flatDays(), now}),
    'Rain on and off Sun–Wed',
  );
});

test('snow and storms are named', () => {
  const snow = hours(wetBetween(at(1, 6), at(1, 11), {weather_code: 73}));
  assert.equal(
    weekSentence({history, upcoming: snow, days: flatDays(), now}),
    'Snow tomorrow morning',
  );
  const storms = hours(wetBetween(at(1, 15), at(1, 18), {weather_code: 95}));
  assert.match(
    weekSentence({history, upcoming: storms, days: flatDays(), now}),
    /^Storms tomorrow afternoon/,
  );
});

test('a lone 40% hour is noise, rain past five days is not named', () => {
  const lone = hours((time) =>
    time.getTime() === at(1, 9).getTime()
      ? {precipitation_probability: 45, weather_code: 61}
      : {},
  );
  assert.equal(
    weekSentence({history, upcoming: lone, days: flatDays(), now}),
    'Dry through Mon',
  );
  const far = hours(wetBetween(at(6, 8), at(6, 20)));
  assert.equal(
    weekSentence({history, upcoming: far, days: flatDays(), now}),
    'Dry through Mon',
  );
});

test('the biggest day-to-day swing wins, in time order with the rain', () => {
  const upcoming = hours(wetBetween(at(3, 13), at(3, 17)));
  const days = flatDays([79, 78, 72, 72, 61, 66, 46, 40]);
  assert.equal(
    weekSentence({history, upcoming, days, now}),
    'Rain Sun afternoon · Much colder Wed, highs in the 40s',
  );
});

test('first freeze is news, a freeze in midwinter is not', () => {
  const freezeFriNight = hours((time) =>
    time.getTime() === at(2, 3).getTime() ? {temperature_2m: 29} : {},
  );
  const days = flatDays([70, 56]);
  assert.equal(
    weekSentence({history, upcoming: freezeFriNight, days, now}),
    'Dry through Mon · Colder tomorrow, freezing that night',
  );
  assert.equal(
    weekSentence({history, upcoming: freezeFriNight, days: flatDays(), now}),
    'Dry through Mon · Freezing late tomorrow night',
  );
  const wintry = [{time: at(-1, 5), temperature_2m: 20}];
  assert.equal(
    weekSentence({
      history: wintry,
      upcoming: freezeFriNight,
      days: flatDays(),
      now,
    }),
    'Dry through Mon',
  );
});

test('a long line gives up detail, longest clause first', () => {
  const upcoming = hours(wetBetween(at(4, 2), at(4, 16)));
  const days = flatDays([75, 74, 50]);
  const ways = clauses({history, upcoming, days, now});
  assert.equal(
    fitWeek(ways, () => true),
    'Much colder Sat, highs in the 50s · Rain late Sun night into Mon afternoon',
  );
  const fitsIn = (n) => (text) => text.length <= n;
  assert.equal(
    fitWeek(ways, fitsIn(60)),
    'Much colder Sat, highs in the 50s · Rain late Sun night–Mon',
  );
  assert.equal(
    fitWeek(ways, fitsIn(45)),
    'Much colder Sat · Rain late Sun night–Mon',
  );
  assert.equal(fitWeek(ways, fitsIn(10)), 'Much colder Sat · Rain Mon');
});
