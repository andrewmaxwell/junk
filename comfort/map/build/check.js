// Checks the map against an independent source: the same hours at a few places,
// from Open-Meteo's archive (ECMWF reanalysis, ~10-25 km) instead of HRRR, scored
// with the same `comfort.js`, and compared with what `score.js` checkpointed for
// the nearest cell.
//
//   node comfort/map/build/check.js --start 2025-10-20 --end 2026-10-19
//
// Only whole months are compared, so the edges of the range are dropped. Agreement
// is not expected to be exact: the archive is coarser, misses coastal fog and
// mountain detail, and smears rain into drizzle. What it catches is the kind of
// mistake that moves a whole place or season, like a wrong unit or field.

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ACTIVITIES, scoreComfort} from '../../js/comfort.js';
import {
  ACTIVITY_KEYS,
  GOOD_SCORE,
  GRID_DIR,
  STAT_FIELDS,
  WAKING_END_HOUR,
  WAKING_START_HOUR,
  runDir,
} from './common.js';

const PLACES = {
  'Newport, OR': [44.63, -124.05],
  'Seattle, WA': [47.61, -122.33],
  'San Francisco, CA': [37.77, -122.42],
  'San Diego, CA': [32.72, -117.16],
  'Phoenix, AZ': [33.45, -112.07],
  'Denver, CO': [39.74, -104.99],
  'Minneapolis, MN': [44.98, -93.27],
  'Chicago, IL': [41.88, -87.63],
  'Dallas, TX': [32.78, -96.8],
  'Atlanta, GA': [33.75, -84.39],
  'Miami, FL': [25.77, -80.19],
  'New York, NY': [40.71, -74.0],
};

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2)
  args[argv[i].replace(/^--/, '')] = argv[i + 1];

// The months `score.js` kept, and the whole ones among them.
const months = [];
for (let m = args.start.slice(0, 7); m <= args.end.slice(0, 7); ) {
  months.push(m);
  const [y, mo] = m.split('-').map(Number);
  m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}
const whole = months.slice(1, -1);

const grid = JSON.parse(await readFile(join(GRID_DIR, 'grid.json'), 'utf8'));
const lats = new Float32Array(
  (await readFile(join(GRID_DIR, 'lat.f32'))).buffer,
);
const lons = new Float32Array(
  (await readFile(join(GRID_DIR, 'lon.f32'))).buffer,
);
const file = await readFile(
  join(runDir(args.start, args.end), 'checkpoint.bin'),
);
const offset = 4 + file.readUInt32LE(0) * 10;
const stats = new Uint16Array(
  file.buffer.slice(file.byteOffset + offset, file.byteOffset + file.length),
);
const fieldCount = STAT_FIELDS.length;

function nearestCell(lat, lon) {
  let best = 0;
  let bestDistance = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (let c = 0; c < grid.count; c++) {
    const d = (lats[c] - lat) ** 2 + ((lons[c] - lon) * k) ** 2;
    if (d < bestDistance) [best, bestDistance] = [c, d];
  }
  return best;
}

function mapShare(cell, activity, monthKeys) {
  let hours = 0;
  let good = 0;
  for (const key of monthKeys) {
    const base =
      ((cell * ACTIVITY_KEYS.length + activity) * months.length +
        months.indexOf(key)) *
      fieldCount;
    hours += stats[base];
    good += stats[base + 1];
  }
  return good / hours;
}

const FIELDS = [
  'temperature_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'direct_normal_irradiance',
  'soil_temperature_0_to_7cm',
  'precipitation',
  'weather_code',
  'is_day',
];

async function fetchJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt === 4) throw new Error(`${res.status} ${await res.text()}`);
    await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
  }
}

async function archiveShares(lat, lon) {
  const first = `${whole[0]}-01`;
  const [y, m] = whole.at(-1).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const range = `latitude=${lat}&longitude=${lon}&start_date=${first}&end_date=${last}&timezone=auto`;
  const [weather, air] = await Promise.all([
    fetchJson(
      `https://archive-api.open-meteo.com/v1/archive?${range}` +
        `&hourly=${FIELDS.join(',')}&temperature_unit=fahrenheit&wind_speed_unit=mph`,
    ),
    fetchJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${range}&hourly=us_aqi,uv_index`,
    ),
  ]);
  const shares = ACTIVITY_KEYS.map(() => ({hours: 0, good: 0}));
  weather.hourly.time.forEach((time, i) => {
    const hour = Number(time.slice(11, 13));
    if (hour < WAKING_START_HOUR || hour >= WAKING_END_HOUR) return;
    const row = {};
    for (const field of FIELDS) row[field] = weather.hourly[field][i];
    if (row.temperature_2m === null) return;
    row.uv_index = air.hourly.uv_index[i];
    row.us_aqi = air.hourly.us_aqi[i];
    ACTIVITY_KEYS.forEach((key, a) => {
      shares[a].hours++;
      if (scoreComfort(row, {activity: ACTIVITIES[key]}).score >= GOOD_SCORE)
        shares[a].good++;
    });
  });
  return shares.map(({hours, good}) => good / hours);
}

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
console.log(`Good+ share of waking hours, ${whole[0]} to ${whole.at(-1)}`);
console.log('place                 walk: map  arch   sit: map  arch');
const differences = ACTIVITY_KEYS.map(() => []);
for (const [name, [lat, lon]] of Object.entries(PLACES)) {
  const cell = nearestCell(lat, lon);
  const archive = await archiveShares(lat, lon);
  const cols = ACTIVITY_KEYS.map((_, a) => {
    const map = mapShare(cell, a, whole);
    differences[a].push(map - archive[a]);
    return `${pct(map)}  ${pct(archive[a])}`;
  });
  console.log(`${name.padEnd(20)}       ${cols.join('        ')}`);
}
ACTIVITY_KEYS.forEach((key, a) => {
  const d = differences[a];
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  const meanAbs = d.reduce((s, x) => s + Math.abs(x), 0) / d.length;
  console.log(
    `${key}: map minus archive averages ${Math.round(mean * 100)} points, ` +
      `${Math.round(meanAbs * 100)} points either way`,
  );
});
