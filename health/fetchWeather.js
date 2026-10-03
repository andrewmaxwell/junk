// Downloads hourly weather and air quality for home from Open-Meteo (free, no
// key) into data/weather/. Refetches everything each run; it's a few requests.
// Usage: node health/fetchWeather.js [--since 2021-01-01]

import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {dataDir, readJson} from './googleAuth.js';

// Home location lives in data/config.json so it stays out of the public repo.
const {home} = (await readJson(join(dataDir, 'config.json'))) ?? {};
if (!home) throw new Error('Missing "home" in data/config.json, see README.md');
const location = {latitude: home.latitude, longitude: home.longitude};

const i = process.argv.indexOf('--since');
const since = i === -1 ? '2021-01-01' : process.argv[i + 1];
const today = new Date().toLocaleDateString('en-CA', {
  timeZone: home.timezone,
});

const weatherVars = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'pressure_msl',
  'surface_pressure',
  'precipitation',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
  'shortwave_radiation',
];
const airVars = [
  'pm2_5',
  'pm10',
  'ozone',
  'nitrogen_dioxide',
  'us_aqi',
  'dust',
];

const get = async (base, params) => {
  const url = `${base}?${new URLSearchParams({
    ...location,
    // Open-Meteo applies one fixed UTC offset to the whole range when given a
    // time zone, so winter times come out an hour off. Fetch UTC instead and
    // let schema.sql convert with proper daylight saving rules.
    timezone: 'GMT',
    ...params,
  })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text()}`);
  return res.json();
};

// Hourly arrays to one object per hour, with local wall clock times.
const toRows = ({hourly}) =>
  hourly.time.map((time, i) =>
    Object.fromEntries([
      ['time', time],
      ...Object.keys(hourly)
        .filter((k) => k !== 'time')
        .map((k) => [k, hourly[k][i]]),
    ]),
  );

// The archive lags real time by a few days, so the forecast API's recent past
// fills the gap. Archive rows win where both have data.
const archive = await get('https://archive-api.open-meteo.com/v1/archive', {
  start_date: since,
  end_date: today,
  hourly: weatherVars.join(','),
  daily: 'sunrise,sunset',
});
const recent = await get('https://api.open-meteo.com/v1/forecast', {
  past_days: 14,
  forecast_days: 1,
  hourly: weatherVars.join(','),
});
const byTime = new Map();
for (const row of [...toRows(recent), ...toRows(archive)]) {
  if (row.time.slice(0, 10) > today) continue;
  const existing = byTime.get(row.time);
  if (!existing || row.temperature_2m !== null) byTime.set(row.time, row);
}
const weather = [...byTime.values()]
  .filter((r) => r.temperature_2m !== null)
  .sort((a, b) => a.time.localeCompare(b.time));

const air = toRows(
  await get('https://air-quality-api.open-meteo.com/v1/air-quality', {
    start_date: since,
    end_date: today,
    hourly: airVars.join(','),
  }),
).filter((r) => r.pm2_5 !== null);

const dir = join(dataDir, 'weather');
await mkdir(dir, {recursive: true});
const jsonl = (rows) => rows.map((r) => JSON.stringify(r) + '\n').join('');
await writeFile(join(dir, 'hourly.jsonl'), jsonl(weather));
await writeFile(join(dir, 'air.jsonl'), jsonl(air));
await writeFile(
  join(dir, 'sun.jsonl'),
  jsonl(
    archive.daily.time.map((day, i) => ({
      day,
      sunrise: archive.daily.sunrise[i],
      sunset: archive.daily.sunset[i],
    })),
  ),
);
console.log(
  `weather: ${weather.length} hours (${weather[0].time} to ${weather.at(-1).time})`,
);
console.log(
  `air quality: ${air.length} hours (${air[0]?.time} to ${air.at(-1)?.time})`,
);
