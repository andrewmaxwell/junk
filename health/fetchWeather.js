// Downloads hourly weather and air quality for home from Open-Meteo (free, no
// key) into data/weather/, plus weather where Andrew was on days he spent far
// from home (found in data/Timeline.json). Refetches everything each run; it's
// a few requests.
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

const get = async (base, params, at = location) => {
  const url = `${base}?${new URLSearchParams({
    ...at,
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

// Hourly arrays to one object per hour, in UTC.
const toRows = ({hourly, elevation}) =>
  hourly.time.map((time, i) =>
    Object.fromEntries([
      ['time', time],
      ['elevation', elevation],
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

// Days spent mostly 50+ km from home, from Timeline visits. Each gets the
// weather where Andrew spent the most time that day, tagged with that place's
// UTC offset so schema.sql can convert to local time.
const parseLatLng = (s) => s.replace(/°/g, '').split(',').map(Number);
const kmBetween = ([lat1, lon1], [lat2, lon2]) => {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};
const visits = (
  (await readJson(join(dataDir, 'Timeline.json')))?.semanticSegments ?? []
)
  .filter((s) => s.visit)
  .map((s) => ({
    start: s.startTime.slice(0, 19),
    end: s.endTime.slice(0, 19),
    offset: s.startTimeTimezoneUtcOffsetMinutes,
    home: s.visit.topCandidate.semanticType === 'HOME',
    point: parseLatLng(s.visit.topCandidate.placeLocation.latLng),
  }));
const homeVisits = visits.filter((v) => v.home);
const homePoint = [0, 1].map(
  (i) => homeVisits.reduce((sum, v) => sum + v.point[i], 0) / homeVisits.length,
);
const minutesOn = (v, day) => {
  const from = Math.max(Date.parse(v.start), Date.parse(day));
  const to = Math.min(Date.parse(v.end), Date.parse(day) + 864e5);
  return Math.max(0, (to - from) / 6e4);
};
const mainPlace = new Map(); // day -> {visit, minutes}
for (const v of visits) {
  for (
    let t = Date.parse(v.start.slice(0, 10));
    t < Date.parse(v.end);
    t += 864e5
  ) {
    const day = new Date(t).toISOString().slice(0, 10);
    const minutes = minutesOn(v, day);
    if (minutes > (mainPlace.get(day)?.minutes ?? 0)) {
      mainPlace.set(day, {visit: v, minutes});
    }
  }
}
// Consecutive away days near the same place share one request.
const stays = [];
for (const [day, {visit}] of [...mainPlace].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (visit.home || kmBetween(visit.point, homePoint) < 50) continue;
  const last = stays.at(-1);
  if (last && kmBetween(last.point, visit.point) < 30) last.days.push(day);
  else stays.push({point: visit.point, days: [day]});
}
const awayWeather = [];
const awayAir = [];
for (const {point, days} of stays) {
  const at = {latitude: point[0], longitude: point[1]};
  // Pad a day each side, since local days span two UTC dates.
  const pad = (day, n) =>
    new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);
  const range = {start_date: pad(days[0], -1), end_date: pad(days.at(-1), 1)};
  // Rows get the UTC offset of the stay's first day, which is close enough.
  const offset = mainPlace.get(days[0]).visit.offset;
  const keep = (rows) =>
    rows.flatMap((r) => {
      const local = Date.parse(r.time + 'Z') + offset * 6e4;
      const day = new Date(local).toISOString().slice(0, 10);
      // The archive lags a few days; skip empty hours so home weather stays.
      const empty = r.temperature_2m === null || r.pm2_5 === null;
      return days.includes(day) && !empty
        ? [{...r, place: point.join(','), utc_offset_min: offset}]
        : [];
    });
  awayWeather.push(
    ...keep(
      toRows(
        await get(
          'https://archive-api.open-meteo.com/v1/archive',
          {...range, hourly: weatherVars.join(',')},
          at,
        ),
      ),
    ),
  );
  awayAir.push(
    ...keep(
      toRows(
        await get(
          'https://air-quality-api.open-meteo.com/v1/air-quality',
          {...range, hourly: airVars.join(',')},
          at,
        ),
      ),
    ),
  );
}

const dir = join(dataDir, 'weather');
await mkdir(dir, {recursive: true});
const jsonl = (rows) => rows.map((r) => JSON.stringify(r) + '\n').join('');
await writeFile(join(dir, 'hourly.jsonl'), jsonl(weather));
await writeFile(join(dir, 'air.jsonl'), jsonl(air));
await writeFile(join(dir, 'away_hourly.jsonl'), jsonl(awayWeather));
await writeFile(join(dir, 'away_air.jsonl'), jsonl(awayAir));
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
console.log(
  `away from home: ${stays.length} trips, ${stays.flatMap((s) => s.days).length} days`,
);
