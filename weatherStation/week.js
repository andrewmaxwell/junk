// ---------------------------------------------------------------------------
// The week in words: one line over the 10-day chart that says what the chart
// shows, for reading from the couch. At most two things, in the order they
// happen: the next stretch of rain or snow, and the biggest turn warmer or
// colder (or the first freeze). "Rain Sun afternoon into Mon night · Much
// colder Thu, freezing that night"
// ---------------------------------------------------------------------------

import {SNOW_CODES, STORM_CODES, FREEZING, WET_CHANCE} from './constants.js';

// Wet hours closer together than this are one spell, "on and off".
const MERGE_GAP_HOURS = 6;
// A lone wet hour is noise unless the forecast is fairly sure of it.
const LONE_HOUR_CHANCE = 60;
// Rain is only named this far out; past it the forecast is a guess.
const WET_DAYS = 5;
// A day's high (°F air) this far from the day before is a change of weather.
const SWING = 10;
const BIG_SWING = 20;
const SWING_DAYS = 7;

const HOUR = 3600_000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAhead = (now, date) =>
  Math.round((startOfDay(date) - startOfDay(now)) / (24 * HOUR));

function dayWord(date, now) {
  const ahead = daysAhead(now, date);
  if (ahead <= 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return date.toLocaleDateString(undefined, {weekday: 'short'});
}

// Forecast words for an hour: "this afternoon", "tonight", "Sun morning".
// The small hours belong to the night before, the way forecasters say it, but
// spelled "late Sat night" so it isn't misread against the 10-day columns,
// where those hours sit under Sunday.
export function partOfDay(time, now) {
  const h = time.getHours();
  let date = time;
  let part;
  if (h < 6) {
    date = new Date(time.getFullYear(), time.getMonth(), time.getDate() - 1);
    part = 'late night';
  } else if (h < 12) part = 'morning';
  else if (h < 18) part = 'afternoon';
  else if (h < 21) part = 'evening';
  else part = 'night';
  if (daysAhead(now, date) <= 0) {
    const words = part.endsWith('night') ? 'tonight' : `this ${part}`;
    return {day: 'today', words};
  }
  const day = dayWord(date, now);
  const words = part === 'late night' ? `late ${day} night` : `${day} ${part}`;
  return {day, words, part};
}

const clock = (date) => {
  const h = date.getHours();
  return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
};

function wetSpells(rows) {
  const spells = [];
  for (const row of rows) {
    if ((row.precipitation_probability ?? 0) < WET_CHANCE) continue;
    const last = spells.at(-1);
    if (last && row.time - last.end <= MERGE_GAP_HOURS * HOUR) {
      last.end = row.time;
      last.rows.push(row);
    } else spells.push({start: row.time, end: row.time, rows: [row]});
  }
  return spells.filter(
    (s) =>
      s.rows.length > 1 ||
      s.rows[0].precipitation_probability >= LONE_HOUR_CHANCE,
  );
}

function kindOf(rows) {
  if (rows.some((r) => STORM_CODES.has(r.weather_code))) return 'Storms';
  const snowy = rows.filter((r) => SNOW_CODES.has(r.weather_code)).length;
  if (!snowy) return 'Rain';
  return snowy === rows.length ? 'Snow' : 'Rain and snow';
}

// Each way of saying it, longest first; the page uses the longest that fits.
function describeSpell(spell, now) {
  const words = spellWords(spell, now);
  const from = partOfDay(spell.start, now);
  const to = partOfDay(spell.end, now);
  const kind = kindOf(spell.rows);
  return [
    ...new Set([
      words,
      // "Rain late Mon night–Tue"
      spell.start > now && from.day !== to.day
        ? `${kind} ${from.words}–${to.day}`
        : words,
      // Just the calendar day it starts, as the 10-day columns have it.
      spell.start > now ? `${kind} ${dayWord(spell.start, now)}` : words,
    ]),
  ];
}

function spellWords(spell, now) {
  const kind = kindOf(spell.rows);
  const hours = (spell.end - spell.start) / HOUR + 1;
  const patchy = spell.rows.length < 0.7 * hours ? ' on and off' : '';
  // The spell's last wet hour runs to the top of the next one.
  const until = new Date(spell.end.getTime() + HOUR);

  if (spell.start <= now) {
    const by =
      until - now <= 12 * HOUR ? clock(until) : partOfDay(spell.end, now).words;
    return `${kind}${patchy} till ${by}`;
  }
  if (hours > 48) {
    return `${kind}${patchy} ${dayWord(spell.start, now)}–${dayWord(spell.end, now)}`;
  }
  const from = partOfDay(spell.start, now);
  const to = partOfDay(spell.end, now);
  if (from.words === to.words) return `${kind}${patchy} ${from.words}`;
  // Small hours through the morning after: "early Sun morning".
  if (
    from.part === 'late night' &&
    to.part === 'morning' &&
    daysAhead(spell.start, spell.end) === 0
  )
    return `${kind}${patchy} early ${dayWord(spell.end, now)} morning`;
  // "Sun morning to evening" rather than naming Sun twice.
  if (from.day === to.day && from.part)
    return `${kind}${patchy} ${from.words} to ${to.part}`;
  return `${kind}${patchy} ${from.words} into ${to.words}`;
}

const decade = (t) => {
  const d = Math.floor(t / 10) * 10;
  return d < 10 ? 'single digits' : `${d}s`;
};

// The first hour at or below freezing, as long as it hasn't already frozen in
// the last day: once winter sets in, a nightly "freezing" is just noise.
function firstFreeze(history, upcoming, now) {
  if (history.some((r) => r.temperature_2m <= FREEZING)) return null;
  const horizon = now.getTime() + SWING_DAYS * 24 * HOUR;
  return (
    upcoming.find((r) => r.time <= horizon && r.temperature_2m <= FREEZING) ??
    null
  );
}

// `history` and `upcoming` are hourly rows (comfort's, with the 10 days' air
// temperature), `days` the 10-day summary with each day's air `hi`, today first. Returns the clauses in time
// order, each a list of ways to say it, longest first.
export function weekSentence({history, upcoming, days, now}) {
  const clauses = [];

  const wetHorizon = startOfDay(now).getTime() + WET_DAYS * 24 * HOUR;
  const spell = wetSpells(upcoming).find((s) => s.start < wetHorizon);
  if (spell) clauses.push({at: spell.start, ways: describeSpell(spell, now)});

  let swing = null;
  for (let k = 1; k < Math.min(days.length, SWING_DAYS); k++) {
    const change = days[k].hi - days[k - 1].hi;
    if (
      Math.abs(change) >= SWING &&
      (!swing || Math.abs(change) > Math.abs(swing.change))
    )
      swing = {k, change};
  }
  const freeze = firstFreeze(history, upcoming, now);
  const freezeWhen = freeze && partOfDay(freeze.time, now);

  if (swing) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + swing.k,
    );
    const day = dayWord(date, now);
    const word =
      (Math.abs(swing.change) >= BIG_SWING ? 'Much ' : '') +
      (swing.change < 0 ? 'colder' : 'warmer');
    const short = `${word[0].toUpperCase()}${word.slice(1)} ${day}`;
    let text = short;
    // A freeze is news the highs below the chart don't show; the highs are.
    if (freeze && Math.abs(freeze.time - date) < 2 * 24 * HOUR)
      text += `, freezing ${freezeWhen.day === day && freezeWhen.part?.endsWith('night') ? 'that night' : freezeWhen.words}`;
    else text += `, highs in the ${decade(days[swing.k].hi)}`;
    clauses.push({at: date, ways: [text, short]});
  } else if (freeze) {
    clauses.push({at: freeze.time, ways: [`Freezing ${freezeWhen.words}`]});
  }

  if (!spell) {
    const last = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + WET_DAYS - 1,
    );
    clauses.push({at: now, ways: [`Dry through ${dayWord(last, now)}`]});
  }
  return clauses.sort((a, b) => a.at - b.at).map((c) => c.ways);
}

// The longest version that `fits`: while it doesn't, the longest clause that
// can be said more briefly is.
export function fitWeek(clauses, fits) {
  const pick = clauses.map(() => 0);
  const text = () => clauses.map((ways, i) => ways[pick[i]]).join(' · ');
  while (!fits(text())) {
    let longest = -1;
    clauses.forEach((ways, i) => {
      if (
        pick[i] < ways.length - 1 &&
        (longest < 0 ||
          ways[pick[i]].length > clauses[longest][pick[longest]].length)
      )
        longest = i;
    });
    if (longest < 0) break;
    pick[longest]++;
  }
  return text();
}
