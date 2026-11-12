import {
  fetchWeatherBundle,
  describeWeatherCode,
  weatherIcon,
} from '../comfort/js/weather.js';
import {feltTemperature, thermalStress} from '../comfort/js/thermal.js';
import {describeHumidity} from '../comfort/js/comfort.js';
import {dewPointF} from './indoor.js';
import {
  drawHourly,
  drawDaily,
  temperatureColor,
  hourLabel,
  hourRange,
} from './charts.js';
import {pickActions} from './advice.js';
import {weekSentence, fitWeek} from './week.js';
import {SNOW_CODES, FREEZING, WET_CHANCE} from './constants.js';

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
// The app repeats the thermostat's state every minute while it's connected.
const SENSI_STALE_MS = 5 * 60_000;
const FORECAST_DAYS = 10;

const $ = (id) => document.getElementById(id);
const hourMinute = (d) =>
  `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
const clockTime = (ms) => {
  const d = new Date(ms);
  const time = `${hourMinute(d)}${d.getHours() < 12 ? 'am' : 'pm'}`;
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

// --- Outside ----------------------------------------------------------------

// Feels-like in the shade, for the hero and the 24 hours. The 10 days are air
// temperature, like any other forecast: UTCI can sit 20° under the air on a
// breezy night, which reads as a freeze that isn't coming. They come from NOAA's
// National Blend, which beat Open-Meteo's default from two days out by about 2°
// against the airport's readings; the default won for right now.
const tenDayAir = (row) => row.blend_air ?? row.temperature_2m;
const felt = (row) => feltTemperature(row, {shaded: true});

const isFreezing = (air) => air <= FREEZING;

function windWords(mph) {
  if (mph >= 20) return 'windy';
  if (mph >= 12) return 'breezy';
  if (mph >= 5) return 'light breeze';
  return null;
}

// The first run of likely rain or snow in the window, for the chart's label.
function wetSpell(hours) {
  const start = hours.findIndex((h) => h.chance >= WET_CHANCE);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < hours.length && hours[end + 1].chance >= WET_CHANCE) end++;
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
    const airs = day.map(tenDayAir);
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
        air: mean(block.map(tenDayAir)),
        freezing: block.map(tenDayAir).some(isFreezing),
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
      hi: Math.max(...airs),
      lo: Math.min(...airs),
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
    freezing: isFreezing((i === 0 ? current : row).temperature_2m),
    chance: row.precipitation_probability ?? 0,
    radiation: row.shortwave_radiation,
    snow: SNOW_CODES.has(row.weather_code),
  }));
  drawHourly($('hourly'), hours, wetSpell(hours));
  const week = $('week');
  const withTenDayAir = (r) => ({...r, temperature_2m: tenDayAir(r)});
  const clauses = weekSentence({
    history: weather.rows
      .filter((r) => r.time <= now && now - r.time < 24 * 3600_000)
      .map(withTenDayAir),
    upcoming: upcoming.map(withTenDayAir),
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
function insideConditions() {
  if (!aranet || !Number.isFinite(aranet.tempC)) return null;
  const aranetF = toF(aranet.tempC);
  const dewF = dewPointF(aranetF, aranet.rh);
  return {airF: sensi?.tempF ?? aranetF, dewF, co2: aranet.co2};
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
    $('in-temp').textContent = '–';
    $('in-air').textContent = 'Waiting for the Aranet4';
    $('in-co2').textContent = '';
    return;
  }
  $('in-temp').textContent = `${round(inside.airF)}°`;
  $('in-air').innerHTML =
    `<span class="word">${describeHumidity(inside.dewF)}</span> · dew ${round(inside.dewF)}°`;
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
  $('time').textContent = hourMinute(now);
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
      sun = ` · <i class="ti ti-${icon}" aria-hidden="true"></i> ${hourMinute(time)}`;
  }
  $('date').innerHTML = date + sun;
}

function renderActions(context) {
  $('actions').innerHTML = pickActions(context)
    .map(
      (a) => `<div class="action">
        <span class="dot" style="background: ${a.color}"></span>
        <div class="title">${a.title}</div>
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
  // Advice shouldn't rest on an old setpoint, so a lost connection drops it.
  if (sensi && Date.now() - sensi.receivedAt > SENSI_STALE_MS) sensi = null;
  renderClock(now);
  const inside = insideConditions();
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

// The National Blend's hourly air temperature, by local time. Without it the 10
// days fall back on the main forecast's.
async function fetchBlendAir() {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m` +
        '&models=ncep_nbm_conus&temperature_unit=fahrenheit&timezone=auto' +
        `&past_days=1&forecast_days=${FORECAST_DAYS + 1}`,
      {signal: AbortSignal.timeout(10_000)},
    );
    if (!res.ok)
      throw new Error(`National Blend request failed (${res.status})`);
    const {hourly} = await res.json();
    return new Map(hourly.time.map((t, i) => [t, hourly.temperature_2m[i]]));
  } catch (error) {
    console.warn(error);
    return new Map();
  }
}

let retries = 0;
let nextLoad = null;

async function loadWeather() {
  clearTimeout(nextLoad);
  let wait = WEATHER_REFRESH_MS;
  try {
    // One past day so today's low counts the hours already gone.
    const [{current, rows, sunset, nextSunrise}, blendAir] = await Promise.all([
      fetchWeatherBundle(LAT, LON, {
        historyDays: 1,
        forecastDays: FORECAST_DAYS + 1,
      }),
      fetchBlendAir(),
    ]);
    for (const row of rows) row.blend_air = blendAir.get(row.key) ?? null;
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
    window.onSensi({
      tempF: 72,
      heatSetpoint: 68,
      coolSetpoint: 80,
      mode: 'heat',
      running: null,
    });
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
  tick();
  setInterval(tick, 60_000);
}

// --- Updates ----------------------------------------------------------------

// Each deploy writes version.txt (see .github/workflows/pages.yml). When it
// changes, a plain reload could still run scripts from the browser's cache for
// up to 10 minutes and then never look again, so refresh those first.
const VERSION_CHECK_MS = 60_000;
let version = null;

async function checkVersion() {
  try {
    const res = await fetch('./version.txt', {cache: 'no-store'});
    if (!res.ok) return;
    const latest = await res.text();
    if (version !== null && latest !== version) {
      const scripts = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter(
          (url) =>
            url.startsWith(location.origin) &&
            new URL(url).pathname.endsWith('.js'),
        );
      await Promise.allSettled(
        scripts.map((url) => fetch(url, {cache: 'reload'})),
      );
      location.reload();
    }
    version = latest;
  } catch {
    // Offline: the next check tries again.
  }
}

checkVersion();
setInterval(checkVersion, VERSION_CHECK_MS);

if (params.has('demo')) startDemo();
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
