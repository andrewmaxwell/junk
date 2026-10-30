import {
  fetchWeatherBundle,
  describeWeatherCode,
  weatherIcon,
} from '../comfort/js/weather.js';
import {feltTemperature, thermalStress} from '../comfort/js/thermal.js';
import {describeHumidity} from '../comfort/js/comfort.js';
import {
  standardEffectiveTemperature,
  clothingFor,
  dewPointF,
  relativeHumidity,
} from './indoor.js';
import {
  drawHourly,
  drawDaily,
  temperatureColor,
  hourLabel,
  hourRange,
} from './charts.js';
import {pickActions} from './advice.js';
import {weekSentence, fitWeek} from './week.js';

// Rounded to ~6 miles: plenty for weather, and junk is public.
// Override with ?lat=..&lon=.. (the Android app's page URL can carry them).
const params = new URLSearchParams(location.search);
const LAT = Number(params.get('lat') ?? 38.8);
const LON = Number(params.get('lon') ?? -90.4);

const WEATHER_REFRESH_MS = 10 * 60_000;
// After a failed fetch, try again sooner, backing off to the usual 10 minutes.
const RETRY_MS = [1, 2, 5].map((m) => m * 60_000);
const OUTSIDE_STALE_MS = 30 * 60_000;
const INSIDE_STALE_MS = 5 * 60_000;
const FORECAST_DAYS = 10;

const $ = (id) => document.getElementById(id);
const clockTime = (ms) => {
  const d = new Date(ms);
  const time = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${d.getHours() < 12 ? 'am' : 'pm'}`;
  return new Date().toDateString() === d.toDateString()
    ? time
    : `${d.toLocaleDateString(undefined, {weekday: 'short'})} ${time}`;
};
const round = (n) => Math.round(n);
const toF = (c) => c * 1.8 + 32;

// --- State ------------------------------------------------------------------

let weather = null; // comfort's bundle, plus when it arrived
let weatherAt = 0;
let weatherError = null; // why the last fetch failed, while it keeps failing
let aranet = null; // latest Aranet4 broadcast, plus when it arrived
let aranetHistory = [];
let sensi = null;

// The Android app calls these. See weather-station-android's README.
window.onAranet = (reading) => {
  aranet = {...reading, receivedAt: Date.now()};
  const last = aranetHistory.at(-1);
  if (!last || reading.measuredAt - last.measuredAt > 30_000)
    aranetHistory.push(reading);
  render();
};
window.onAranetHistory = (readings) => {
  aranetHistory = readings;
  render();
};
// {tempF, heatSetpoint, coolSetpoint, mode, running: 'heat' | 'cool' | null}
window.onSensi = (state) => {
  sensi = {...state, receivedAt: Date.now()};
  render();
};

// The room's light level in lux, from the tablet's sensor. The app dims the
// screen itself; the page just switches to a warmer, lower-contrast look once
// the room is dark. Two thresholds, so a lamp at the edge doesn't flicker it.
const NIGHT_BELOW_LUX = 8;
const DAY_ABOVE_LUX = 20;
window.onLight = (lux) => {
  const body = document.body.classList;
  if (lux < NIGHT_BELOW_LUX) body.add('night');
  else if (lux > DAY_ABOVE_LUX) body.remove('night');
};

// --- Outside ----------------------------------------------------------------

// Feels-like in the shade everywhere, so the hero, the 24 hours and the 10 days
// are one consistent number.
const felt = (row) => feltTemperature(row, {shaded: true});

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

function windWords(mph) {
  if (mph >= 20) return 'windy';
  if (mph >= 12) return 'breezy';
  if (mph >= 5) return 'light breeze';
  return null;
}

// "2–11am", or "10pm–3am" across the period change.

// The first run of likely rain or snow in the window, for the chart's label.
function wetSpell(hours) {
  const start = hours.findIndex((h) => h.chance >= 40);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < hours.length && hours[end + 1].chance >= 40) end++;
  const kind = hours.slice(start, end + 1).some((h) => h.snow)
    ? 'snow'
    : 'rain';
  const until = new Date(hours[end].time.getTime() + 3600_000);
  const label =
    start === 0
      ? `${kind} till ${hourLabel(until)}m`
      : `${kind} ${hourRange(hours[start].time, until)}`;
  return {from: start, to: end, label};
}

const dateKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function summarizeDays(rows, now) {
  const byDay = new Map();
  for (const row of rows) {
    const key = dateKey(row.time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(row);
  }
  const days = [];
  for (let k = 0; k < FORECAST_DAYS; k++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
    const day = byDay.get(dateKey(date));
    if (!day || day.length < 12) break;
    const felts = day.map(felt);
    // The day's weather is its worst daytime hour: a sunny day with an
    // afternoon storm is a storm day.
    const daytime = day.filter(
      (r) => r.time.getHours() >= 7 && r.time.getHours() < 20,
    );
    const code = Math.max(...daytime.map((r) => r.weather_code ?? 0));
    // Three-hour blocks for the 10-day line: smooth enough that
    // the week's trend shows through the daily rise and fall.
    const blocks = [];
    for (let h = 0; h < 24; h += 3) {
      const block = day.filter(
        (r) => r.time.getHours() >= h && r.time.getHours() < h + 3,
      );
      if (!block.length) continue;
      const mean = (values) =>
        values.reduce((a, v) => a + v, 0) / values.length;
      blocks.push({
        hour: h + 1.5,
        felt: mean(block.map(felt)),
        chance: Math.max(...block.map((r) => r.precipitation_probability ?? 0)),
        snow: block.some((r) => SNOW_CODES.has(r.weather_code)),
        radiation: mean(block.map((r) => r.shortwave_radiation ?? 0)),
      });
    }
    days.push({
      blocks,
      name: date.toLocaleDateString(undefined, {weekday: 'short'}),
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      longName: date.toLocaleDateString(undefined, {weekday: 'long'}),
      hi: Math.max(...felts),
      lo: Math.min(...felts),
      chance: Math.max(...day.map((r) => r.precipitation_probability ?? 0)),
      snow: day.some((r) => SNOW_CODES.has(r.weather_code)),
      icon: weatherIcon(code, 1),
    });
  }
  return days;
}

function renderOutside(now, days, {current, upcoming}) {
  const feltNow = felt(current);
  const hero = $('out-felt');
  hero.style.color = temperatureColor(feltNow);

  const later = upcoming[3];
  const change = later ? felt(later) - feltNow : 0;
  const arrow =
    Math.abs(change) >= 3
      ? `<i class="ti ti-trending-${change > 0 ? 'up' : 'down'} trend" aria-label="${change > 0 ? 'rising' : 'falling'}"></i>`
      : '';
  hero.innerHTML = `${round(feltNow)}°${arrow}`;

  const stress = thermalStress(feltNow);
  const wind = windWords(current.wind_speed_10m ?? 0);
  const sky = describeWeatherCode(current.weather_code);
  $('sky').textContent = stress
    ? `${sky} · ${stress}`
    : wind
      ? `${sky}, ${wind}`
      : sky;
  $('out-air').innerHTML =
    `<span class="word">${describeHumidity(current.dew_point_2m)}</span> · dew ${round(current.dew_point_2m)}° · air ${round(current.temperature_2m)}°`;

  const hours = upcoming.slice(0, 25).map((row, i) => ({
    time: i === 0 ? now : row.time,
    felt: i === 0 ? feltNow : felt(row),
    chance: row.precipitation_probability ?? 0,
    radiation: row.shortwave_radiation,
    snow: SNOW_CODES.has(row.weather_code),
  }));
  drawHourly($('hourly'), hours, wetSpell(hours));
  const week = $('week');
  const clauses = weekSentence({
    history: weather.rows.filter(
      (r) => r.time <= now && now - r.time < 24 * 3600_000,
    ),
    upcoming,
    days,
    now,
  });
  week.textContent = fitWeek(clauses, (text) => {
    week.textContent = text;
    return week.scrollWidth <= week.clientWidth;
  });
  drawDaily($('daily'), days);
}

// --- Inside -----------------------------------------------------------------

const CO2_WARN = 1000;
const CO2_BAD = 1500;

// The house: temperature from the thermostat when there is one (central, out of
// the sun), moisture from the Aranet4 as a dew point, which is close to the
// same everywhere in the house.
function insideConditions(now) {
  if (!aranet || !Number.isFinite(aranet.tempC)) return null;
  const aranetF = toF(aranet.tempC);
  const dewF = dewPointF(aranetF, aranet.rh);
  const airF = sensi?.tempF ?? aranetF;

  // Clothing follows this morning's outdoor temperature (ASHRAE 55).
  const sixAm = weather?.rows.find(
    (r) => dateKey(r.time) === dateKey(now) && r.time.getHours() === 6,
  );
  const clo = clothingFor(sixAm?.temperature_2m ?? 50);
  const feltF = standardEffectiveTemperature({
    airF,
    rh: relativeHumidity(airF, dewF),
    clo,
  });
  return {airF, dewF, feltF, co2: aranet.co2};
}

function co2Trend() {
  const latest = aranetHistory.at(-1);
  const before = aranetHistory.findLast(
    (r) => latest && latest.measuredAt - r.measuredAt >= 20 * 60_000,
  );
  if (!latest || !before || latest.co2 == null || before.co2 == null) return '';
  const change = latest.co2 - before.co2;
  if (Math.abs(change) < 50) return '';
  return ` <i class="ti ti-trending-${change > 0 ? 'up' : 'down'}" aria-label="${change > 0 ? 'rising' : 'falling'}"></i>`;
}

function sensiWords() {
  if (!sensi) return '';
  const system = sensi.mode === 'cool' ? 'AC' : 'Furnace';
  const set = sensi.mode === 'cool' ? sensi.coolSetpoint : sensi.heatSetpoint;
  const running =
    sensi.running === 'cool'
      ? 'AC on'
      : sensi.running === 'heat'
        ? 'Furnace on'
        : `${system} off`;
  return sensi.mode === 'off'
    ? ' · <span class="muted">System off</span>'
    : ` · <span class="muted">${running}, set ${round(set)}°</span>`;
}

function renderInside(inside) {
  const box = $('inside');
  if (!inside) {
    $('in-felt').textContent = '–';
    $('in-air').textContent = 'Waiting for the Aranet4';
    $('in-co2').textContent = '';
    return;
  }
  $('in-felt').textContent = `${round(inside.feltF)}°`;
  $('in-air').innerHTML =
    `<span class="word">${describeHumidity(inside.dewF)}</span> · dew ${round(inside.dewF)}° · air ${round(inside.airF)}°`;
  const co2 = inside.co2;
  const color =
    co2 >= CO2_BAD ? 'var(--bad)' : co2 >= CO2_WARN ? 'var(--warn)' : 'inherit';
  $('in-co2').innerHTML =
    co2 == null
      ? sensiWords()
      : `CO₂ <span style="color: ${color}">${co2}${co2Trend()}</span>${sensiWords()}`;
  const stale = Date.now() - aranet.receivedAt > INSIDE_STALE_MS;
  box.classList.toggle('stale', stale);
  $('in-age').textContent = stale
    ? `as of ${clockTime(aranet.receivedAt)}`
    : '';
}

// --- Clock and actions ------------------------------------------------------

function renderClock(now) {
  $('time').textContent =
    `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  const date = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  let sun = '';
  if (weather) {
    const {sunset, nextSunrise} = weather;
    const [icon, time] =
      sunset && now < sunset ? ['sunset-2', sunset] : ['sunrise', nextSunrise];
    if (time && time > now)
      sun = ` · <i class="ti ti-${icon}" aria-hidden="true"></i> ${time.getHours() % 12 || 12}:${String(time.getMinutes()).padStart(2, '0')}`;
  }
  $('date').innerHTML = date + sun;
}

function renderActions(context) {
  $('actions').innerHTML = pickActions(context)
    .map(
      (a) => `<div class="action">
        <span class="dot" style="background: ${a.color}"></span>
        <div style="min-width: 0">
          <div class="title">${a.title}</div>
          <div class="sub muted detail">${a.detail}</div>
        </div>
      </div>`,
    )
    .join('');
}

// What "now" and "next" are outside. Normally Open-Meteo's current block, but
// once the forecast is stale (offline, or loaded from the cache after a
// reboot) that block is old news, and the forecast's own hour for now is the
// better guess. Either way the heading says how old the forecast is.
function outsideNow(now) {
  const upcoming = weather.rows.filter(
    (r) => r.time.getTime() + 3600_000 > now.getTime(),
  );
  const stale = Date.now() - weatherAt > OUTSIDE_STALE_MS;
  const current = stale ? upcoming[0] : weather.current;
  $('outside').classList.toggle('stale', stale);
  $('out-age').textContent = stale
    ? `forecast from ${clockTime(weatherAt)}${weatherError ? ' · offline' : ''}`
    : '';
  return current && upcoming.length > 24 ? {current, upcoming} : null;
}

function render() {
  const now = new Date();
  renderClock(now);
  const inside = insideConditions(now);
  renderInside(inside);
  if (!weather) {
    if (weatherError)
      $('sky').textContent = `No forecast yet: ${weatherError} · retrying`;
    return;
  }
  const outside = outsideNow(now);
  if (!outside) {
    $('sky').textContent = 'The saved forecast has run out · retrying';
    return;
  }
  const days = summarizeDays(weather.rows, now);
  renderOutside(now, days, outside);

  renderActions({
    ...outside,
    inside,
    sensi,
    now,
    days,
  });
}

// --- Loading ----------------------------------------------------------------

// The last good forecast, kept so a reboot without internet still has
// something to show (faded, with its age).
const CACHE_KEY = 'weatherStation.weather';

function saveWeather() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({weatherAt, weather}));
  } catch {
    // Storage full or blocked: the cache is a nicety.
  }
}

function restoreWeather() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!saved) return;
    const date = (t) => (t ? new Date(t) : null);
    const {current, rows, sunset, nextSunrise} = saved.weather;
    weather = {
      current: {...current, time: date(current.time)},
      rows: rows.map((r) => ({...r, time: date(r.time)})),
      sunset: date(sunset),
      nextSunrise: date(nextSunrise),
    };
    weatherAt = saved.weatherAt;
  } catch (error) {
    console.warn('Ignoring the saved forecast', error);
  }
}

let retries = 0;
let nextLoad = null;

async function loadWeather() {
  clearTimeout(nextLoad);
  let wait = WEATHER_REFRESH_MS;
  try {
    // One past day so today's low counts the hours already gone.
    const {current, rows, sunset, nextSunrise} = await fetchWeatherBundle(
      LAT,
      LON,
      {historyDays: 1, forecastDays: FORECAST_DAYS + 1},
    );
    weather = {current, rows, sunset, nextSunrise};
    weatherAt = Date.now();
    weatherError = null;
    retries = 0;
    saveWeather();
  } catch (error) {
    // Keep showing the last forecast; it fades and says its age once stale.
    console.warn(error);
    weatherError = !navigator.onLine
      ? 'no internet'
      : error instanceof TypeError
        ? "can't reach Open-Meteo"
        : error.name === 'TimeoutError'
          ? 'Open-Meteo timed out'
          : error.message;
    wait = RETRY_MS[retries++] ?? WEATHER_REFRESH_MS;
  }
  nextLoad = setTimeout(loadWeather, wait);
  render();
}

// Made-up indoor readings for working on the layout without the tablet: ?demo
function startDemo() {
  const start = Date.now();
  const tick = () => {
    const minutes = (Date.now() - start) / 60_000;
    window.onAranet({
      co2: Math.round(1150 + 40 * Math.sin(minutes / 3)),
      tempC: 22.4,
      rh: 48,
      pressure: 1003.1,
      battery: 80,
      status: 2,
      interval: 60,
      age: 10,
      measuredAt: Date.now() - 10_000,
    });
  };
  const history = [];
  for (let m = 120; m > 0; m--) {
    history.push({
      co2: 900 + (120 - m) * 2,
      tempC: 22.4,
      rh: 48,
      measuredAt: start - m * 60_000,
    });
  }
  window.onAranetHistory(history);
  window.onSensi({
    tempF: 72,
    heatSetpoint: 68,
    coolSetpoint: 80,
    mode: 'heat',
    running: null,
  });
  tick();
  setInterval(tick, 60_000);
}

if (params.has('demo')) startDemo();
// ?lux=3 pretends the room is that bright, for working on the night look.
if (params.has('lux')) window.onLight(Number(params.get('lux')));
restoreWeather();
loadWeather();
window.addEventListener('online', loadWeather);
// Redraw on the minute, so the clock turns over when it should.
setTimeout(
  () => {
    render();
    setInterval(render, 60_000);
  },
  60_000 - (Date.now() % 60_000),
);
render();
