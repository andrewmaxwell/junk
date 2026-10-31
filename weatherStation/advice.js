// ---------------------------------------------------------------------------
// The actions area: short things to do, each one line, readable from the couch.
//
// There's room for two, so everything that could be said competes for them:
// safety first, then the house (windows, stale air), then the walk. Each
// candidate carries a `rank` and the two lowest win. What's coming later in
// the week has its own line over the 10-day chart (week.js).
// ---------------------------------------------------------------------------

import {
  ACTIVITIES,
  scoreComfort,
  comfortVerdict,
  findBestWindow,
} from '../comfort/js/comfort.js';
import {hourLabel} from './charts.js';
import {STORM_CODES, WET_CHANCE} from './constants.js';

const COLORS = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  info: 'var(--info)',
};

const RANK = {alert: 0, house: 1, walk: 2};

const at = (date) => hourLabel(date).replace(/([ap])$/, '$1m');

// --- Alerts -----------------------------------------------------------------

const ICE_CODES = new Set([56, 57, 66, 67]);
const DAMAGING_GUST_MPH = 45;
const UNHEALTHY_AQI = 151;
const ALERT_HOURS = 12;

function alerts({current, upcoming}) {
  const found = [];
  const soon = upcoming.slice(0, ALERT_HOURS);
  const first = (test) => soon.find(test);

  const ice = first((row) => ICE_CODES.has(row.weather_code));
  if (ice) found.push({title: `Freezing rain at ${at(ice.time)}`});
  const storm = first((row) => STORM_CODES.has(row.weather_code));
  if (storm) found.push({title: `Storms at ${at(storm.time)}`});
  const gale = first((row) => (row.wind_gusts_10m ?? 0) >= DAMAGING_GUST_MPH);
  if (gale) found.push({title: `High winds at ${at(gale.time)}`});
  if ((current.us_aqi ?? 0) >= UNHEALTHY_AQI)
    found.push({title: 'Unhealthy air outside'});

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
    (row.precipitation_probability ?? 0) >= WET_CHANCE ||
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
    };
  }
  if (openUntil && now.getTime() >= openUntil + CLOSE_REMINDER_MS) remember(0);

  // Not on a smoky or polluted day: that air is worse than the CO₂.
  if (inside?.co2 >= AIR_OUT_CO2 && (current.us_aqi ?? 0) <= POOR_AQI) {
    return {
      ...house,
      color: COLORS.warn,
      title: 'Air out the room',
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
      };
    }
  }
  return null;
}

// --- Walk -------------------------------------------------------------------

const WALK = ACTIVITIES.walk;
const GOOD_WALK = 70;
const OK_WALK = 50;

// comfort's words for its score bands, with "Tolerable" shortened so the
// headline fits on one line.
const walkWord = (score) => comfortVerdict(score).replace('Tolerable', 'Fair');
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
    const title =
      best.start.getDate() === now.getDate()
        ? `${walkWord(best.score)} walk at ${at(best.start)}`
        : `Walk tomorrow ${at(best.start)}`;
    return {
      ...walk,
      color: best.score >= GOOD_WALK ? COLORS.info : COLORS.warn,
      title,
    };
  }
  return {
    ...walk,
    color: COLORS.bad,
    title: 'No good walk today',
  };
}

export function pickActions(context) {
  return [...alerts(context), windowAdvice(context), walkAdvice(context)]
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 2);
}
