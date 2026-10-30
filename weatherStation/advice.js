// ---------------------------------------------------------------------------
// The actions area: short things to do, each a one-line headline plus a reason.
//
// There's room for two, so everything that could be said competes for them:
// safety first, then the house (windows, stale air), then the walk. Each
// candidate carries a `rank` and the two lowest win. What's coming later in
// the week has its own line over the 10-day chart (week.js).
// ---------------------------------------------------------------------------

import {
  ACTIVITIES,
  scoreComfort,
  comfortReason,
  comfortVerdict,
  findBestWindow,
} from '../comfort/js/comfort.js';
import {hourLabel, hourRange} from './charts.js';

const COLORS = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  info: 'var(--info)',
};

const RANK = {alert: 0, house: 1, walk: 2};

const at = (date) => hourLabel(date).replace(/([ap])$/, '$1m');

// --- Alerts -----------------------------------------------------------------

const STORM_CODES = new Set([95, 96, 99]);
const ICE_CODES = new Set([56, 57, 66, 67]);
const DAMAGING_GUST_MPH = 45;
const UNHEALTHY_AQI = 151;
const ALERT_HOURS = 12;

function alerts({current, upcoming}) {
  const found = [];
  const soon = upcoming.slice(0, ALERT_HOURS);
  const first = (test) => soon.find(test);

  const ice = first((row) => ICE_CODES.has(row.weather_code));
  if (ice)
    found.push({
      title: `Freezing rain from ${at(ice.time)}`,
      detail: 'roads and steps will be icy',
    });
  const storm = first((row) => STORM_CODES.has(row.weather_code));
  if (storm)
    found.push({
      title: `Storms from ${at(storm.time)}`,
      detail: 'thunder and lightning likely',
    });
  const gale = first((row) => (row.wind_gusts_10m ?? 0) >= DAMAGING_GUST_MPH);
  if (gale)
    found.push({
      title: `High winds from ${at(gale.time)}`,
      detail: `gusts to ${Math.round(gale.wind_gusts_10m)} mph`,
    });
  if ((current.us_aqi ?? 0) >= UNHEALTHY_AQI)
    found.push({
      title: 'Unhealthy air outside',
      detail: `AQI ${Math.round(current.us_aqi)} · keep windows shut`,
    });

  return found.map((a) => ({...a, rank: RANK.alert, color: COLORS.bad}));
}

// --- Windows ----------------------------------------------------------------

// Andrew's comfort: about 75° and 50% humidity (a dew point near 55°), and
// fresh air whenever it's free. The thermostat holds 68° in winter and 80° in
// summer to keep the bills down, so outside air is free whenever it sits
// between those: letting it in won't make the furnace or the AC run. The
// Sensi's actual setpoints replace these when it's connected.
const IDEAL_F = 75;
const DEFAULT_SETPOINTS = {heat: 68, cool: 80};
// Above this, outside air brings in moisture the AC would have to pull back out.
const MUGGY_DEW_POINT = 60;
// Open-window air can drift this much further from ideal than the house is now
// and still be worth it for the fresh air.
const FRESH_AIR_ALLOWANCE = 2;
const POOR_AQI = 100;
const RAIN_CHANCE = 40;
const STUFFY_CO2 = 1000;
const AIR_OUT_CO2 = 1200;
const LOOKAHEAD_HOURS = 12;
// Not worth opening up for less than this before it's time to close again.
const WORTHWHILE_MS = 2 * 3600_000;

// Is the outside air at this hour free to let in? Returns null if so, or the
// reason it isn't.
function whyNotOpen(row, band) {
  const air = row.temperature_2m;
  if (
    (row.precipitation_probability ?? 0) >= RAIN_CHANCE ||
    (row.precipitation ?? 0) > 0.2
  )
    return 'rain coming';
  if (air < band.heat) return 'getting cold';
  if (air > band.cool) return 'getting hot';
  if ((row.dew_point_2m ?? 0) > MUGGY_DEW_POINT) return 'getting muggy';
  if ((row.us_aqi ?? 0) > POOR_AQI) return 'air getting worse';
  return null;
}

// Would this outside air leave the house about as comfortable, or better?
// Without indoor readings, free air is reason enough.
function houseGains(inside, outsideAir) {
  if (!inside) return true;
  return (
    Math.abs(outsideAir - IDEAL_F) <=
      Math.abs(inside.airF - IDEAL_F) + FRESH_AIR_ALLOWANCE ||
    inside.co2 >= STUFFY_CO2
  );
}

// Up to two short reasons, most important first. `then` is why it ends.
function openReason(inside, current, then) {
  if (!inside) return then ? `free fresh air · then ${then}` : 'free fresh air';
  const out = current.temperature_2m;
  const parts = [];
  if (out > inside.airF + 2 && inside.airF < IDEAL_F) parts.push('warmer');
  if (out < inside.airF - 2 && inside.airF > IDEAL_F) parts.push('cooler');
  if (current.dew_point_2m < inside.dewF - 3 && inside.dewF > 55)
    parts.push('drier');
  // With an ending to fit too, there's only room for the first of these.
  const kept = then ? parts.slice(0, 1) : parts;
  const reasons = [
    kept.length ? `${kept.join(' and ')} out` : 'free fresh air',
  ];
  if (inside.co2 >= STUFFY_CO2) reasons.push('stuffy in');
  if (then) reasons.push(`then ${then}`);
  // Two fit on the line; the ending matters more than the second reason.
  return (reasons.length > 2 ? [reasons[0], reasons[2]] : reasons).join(' · ');
}

const CLOSE_REMINDER_MS = 3 * 3600_000;
const STORE_KEY = 'weatherStation.windowsOpenUntil';

function remember(value) {
  try {
    if (value) localStorage.setItem(STORE_KEY, String(value));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // Private mode or blocked storage: the close reminder just won't survive a reload.
  }
}

function recall() {
  try {
    return Number(localStorage.getItem(STORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function windowAdvice({current, upcoming, inside, sensi, now}) {
  const band = {
    heat: sensi?.heatSetpoint ?? DEFAULT_SETPOINTS.heat,
    cool: sensi?.coolSetpoint ?? DEFAULT_SETPOINTS.cool,
  };
  const ahead = upcoming.slice(1, LOOKAHEAD_HOURS + 1);
  const notNow = whyNotOpen(current, band);
  const house = {rank: RANK.house};

  const end = ahead.find((row) => whyNotOpen(row, band));
  const worthIt = !end || end.time - now >= WORTHWHILE_MS;

  if (!notNow && worthIt && houseGains(inside, current.temperature_2m)) {
    remember(
      end ? end.time.getTime() : now.getTime() + LOOKAHEAD_HOURS * 3600_000,
    );
    const until = end ? ` till ${at(end.time)}` : '';
    const hvac =
      sensi?.running === 'cool'
        ? 'AC off, open windows'
        : sensi?.running === 'heat'
          ? 'Heat off, open windows'
          : null;
    return {
      ...house,
      color: COLORS.good,
      title: hvac ?? `Open windows${until}`,
      detail: openReason(inside, current, end && whyNotOpen(end, band)),
    };
  }

  // We said open earlier and that's over: remind, for a while, to shut them.
  const openUntil = recall();
  if (
    openUntil &&
    now.getTime() >= openUntil - 3600_000 &&
    now.getTime() < openUntil + CLOSE_REMINDER_MS &&
    notNow
  ) {
    return {
      ...house,
      color: COLORS.warn,
      title: 'Close the windows',
      detail: notNow,
    };
  }
  if (openUntil && now.getTime() >= openUntil + CLOSE_REMINDER_MS) remember(0);

  // Not on a smoky or polluted day: that air is worse than the CO₂.
  if (inside?.co2 >= AIR_OUT_CO2 && (current.us_aqi ?? 0) <= POOR_AQI) {
    return {
      ...house,
      color: COLORS.warn,
      title: 'Air out the room',
      detail: `CO₂ ${Math.round(inside.co2)} · 10 minutes will do`,
    };
  }

  // The house is off from ideal and free air that would fix it is coming
  // later today: say when.
  if (inside && Math.abs(inside.airF - IDEAL_F) > 3) {
    const later = ahead.find(
      (row) =>
        row.time.getHours() < 23 &&
        !whyNotOpen(row, band) &&
        Math.abs(row.temperature_2m - IDEAL_F) <
          Math.abs(inside.airF - IDEAL_F) - 2,
    );
    if (later) {
      return {
        ...house,
        color: COLORS.info,
        title: `Open windows at ${at(later.time)}`,
        detail: `${later.temperature_2m < inside.airF ? 'cooler' : 'warmer'} air coming`,
      };
    }
  }
  return null;
}

// --- Walk -------------------------------------------------------------------

const WALK = ACTIVITIES.walk;
const GOOD_WALK = 70;
const OK_WALK = 50;

// comfort's sentence, cut to fit one line: its first clause, then what to wear.
// "Hot enough to wear on you, so go early or late; wear a t-shirt."
//   -> "Hot enough to wear on you; a t-shirt"
const SHORT_LEAD = 28;

// comfort's words for its score bands, with "Tolerable" shortened so the
// headline fits on one line.
const walkWord = (score) => comfortVerdict(score).replace('Tolerable', 'Fair');
// comfort speaks about right now ("It is dark out"); a window later on gets
// the same words moved to then.
const LATER = [
  [/^It is dark out/, 'After dark'],
  [/ falling now/, ' falling'],
  [/^Freezing rain is glazing everything/, 'Freezing rain'],
];
function shortReason(row, result, later = false) {
  let sentence = comfortReason(row, result.limiter, result.penalties, WALK)
    .replace(` ${WALK.phrase}`, '')
    .replace(/\.$/, '');
  if (later)
    for (const [now, then] of LATER) sentence = sentence.replace(now, then);
  const [lead, clothes] = sentence.split('; ');
  const short = lead.length > SHORT_LEAD ? lead.split(',')[0] : lead;
  return clothes ? `${short}; ${clothes.replace(/^wear /, '')}` : short;
}

function walkAdvice({current, upcoming, now}) {
  const hour = now.getHours();
  const result = scoreComfort(current, {activity: WALK});
  if (result.score === null) return null;
  const walk = {rank: RANK.walk};

  if (result.score >= GOOD_WALK && hour >= 6 && hour < 22) {
    return {
      ...walk,
      color: COLORS.good,
      title: `${walkWord(result.score)} walk now`,
      detail: shortReason(current, result),
    };
  }

  // A good window later today beats a better one tomorrow.
  const hoursLeftToday = 22 - hour;
  const today =
    hoursLeftToday > 1 &&
    findBestWindow(upcoming, {
      now,
      activity: WALK,
      horizonHours: hoursLeftToday,
    });
  const best =
    today && today.score >= GOOD_WALK
      ? today
      : findBestWindow(upcoming, {now, activity: WALK});
  if (best && best.score >= OK_WALK) {
    const row = upcoming.find((r) => r.time.getTime() === best.start.getTime());
    // Tomorrow's window gives just its start time, so the line still fits.
    const when =
      best.start.getDate() === now.getDate()
        ? hourRange(best.start, best.end)
        : `${hourLabel(best.start)}m tomorrow`;
    return {
      ...walk,
      color: best.score >= GOOD_WALK ? COLORS.info : COLORS.warn,
      title: `${walkWord(best.score)} walk ${when}`,
      detail: row
        ? shortReason(row, scoreComfort(row, {activity: WALK}), true)
        : '',
    };
  }
  return {
    ...walk,
    color: COLORS.bad,
    title: 'No good walk today',
    detail: shortReason(current, result),
  };
}

export function pickActions(context) {
  return [...alerts(context), windowAdvice(context), walkAdvice(context)]
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 2);
}
