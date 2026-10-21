// Shared configuration for the offline pipeline: `fetch.js` downloads raw
// hourly weather and air quality for a grid over the Lower 48, `process.js`
// scores every waking hour with the app's own comfort model and writes the
// aggregates the page draws.

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const BUILD_DIR = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(BUILD_DIR, '..', 'data');
export const CACHE_DIR = join(BUILD_DIR, 'cache');

// Locations per request. Cache files are numbered by batch, so changing this
// means clearing the cache.
export const BATCH_SIZE = 100;

// The same fields the live app scores, from the Historical Forecast API, which
// archives the very forecast models the app reads — so UV index, weather codes
// and the radiation fluxes are all present, unlike in ERA5.
export const WEATHER_FIELDS = [
  'temperature_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'direct_normal_irradiance',
  'soil_temperature_0cm',
  'uv_index',
  'precipitation',
  'weather_code',
  'is_day',
];

export const WEATHER_URL =
  'https://historical-forecast-api.open-meteo.com/v1/forecast';
export const AIR_QUALITY_URL =
  'https://air-quality-api.open-meteo.com/v1/air-quality';

// Lower 48 only. The grid is padded a cell past the coast so the page can
// interpolate right up to the shoreline before clipping to it.
export const BOUNDS = {west: -125, east: -66.5, south: 24.5, north: 49.5};

// The page and the processor have to agree on these.
export const ACTIVITY_KEYS = ['walk', 'sit'];
export const FACTORS = [
  'heat',
  'cold',
  'rain',
  'wind',
  'sun',
  'air',
  'dark',
  'storm',
  'ice',
  'gale',
];
// hours, good hours, score sum, then one count per factor of the hours below
// Good that the factor was most responsible for.
export const STAT_FIELDS = ['hours', 'good', 'scoreSum', ...FACTORS];

export const readJson = async (path) =>
  JSON.parse(await readFile(path, 'utf8'));

export async function writeJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, JSON.stringify(value));
}

// --- Land mask ---------------------------------------------------------------

const NATION_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/nation-10m.json';

// Just enough TopoJSON to turn the nation outline into lon/lat rings: arcs are
// delta-encoded integers, and a negative arc index means the arc reversed.
function decodeRings(topology) {
  const {scale, translate} = topology.transform;
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const ring = (indexes) =>
    indexes.flatMap((i, n) => {
      const points = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
      return n ? points.slice(1) : points;
    });
  return topology.objects.nation.geometries.flatMap((geometry) =>
    geometry.arcs.flatMap((polygon) => polygon.map(ring)),
  );
}

// Even-odd over every ring, which handles holes without telling them apart.
function inside(rings, lon, lat) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (
        yi > lat !== yj > lat &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      )
        hit = !hit;
    }
  }
  return hit;
}

// Every grid point whose cell touches land, so bilinear interpolation on the
// page always has all four corners for any pixel inside the coastline.
export async function buildGrid(step) {
  const path = join(CACHE_DIR, `grid-${step}.json`);
  if (existsSync(path)) return readJson(path);

  const topology = await (await fetch(NATION_URL)).json();
  const rings = decodeRings(topology).filter((ring) =>
    ring.some(
      ([lon, lat]) =>
        lon > BOUNDS.west - 1 &&
        lon < BOUNDS.east + 1 &&
        lat > BOUNDS.south - 1 &&
        lat < BOUNDS.north + 1,
    ),
  );

  const round = (n) => Math.round(n * 1e4) / 1e4;
  const cols = Math.round((BOUNDS.east - BOUNDS.west) / step) + 1;
  const rows = Math.round((BOUNDS.north - BOUNDS.south) / step) + 1;
  const offsets = [-1, -0.5, 0, 0.5, 1];
  const points = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lat = round(BOUNDS.south + row * step);
      const lon = round(BOUNDS.west + col * step);
      const touchesLand = offsets.some((dy) =>
        offsets.some((dx) => inside(rings, lon + dx * step, lat + dy * step)),
      );
      if (touchesLand) points.push({row, col, lat, lon});
    }
  }

  const grid = {step, cols, rows, bounds: BOUNDS, points};
  await writeJson(path, grid);
  return grid;
}

// --- Arguments ---------------------------------------------------------------

const isoDate = (date) => date.toISOString().slice(0, 10);

// `--days 7` ends two days ago, which is as fresh as the archive reliably is.
// `--start` and `--end` override it, and `--step` is the grid spacing in degrees.
export const batchDir = (step, chunk) =>
  join(CACHE_DIR, `${step}`, `${chunk.start}_${chunk.end}`);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {step: 0.5, days: 7};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] =
      key === 'start' || key === 'end' ? argv[i + 1] : Number(argv[i + 1]);
  }
  if (!args.end) {
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 2);
    args.end = isoDate(end);
  }
  if (!args.start) {
    const start = new Date(`${args.end}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (args.days - 1));
    args.start = isoDate(start);
  }
  return args;
}

// Calendar months, each clipped to the requested range. Fetching a month at a
// time keeps every request small and lets a year-long run resume where it
// stopped.
export function monthChunks(start, end) {
  const chunks = [];
  let cursor = start;
  while (cursor <= end) {
    const [y, m] = cursor.split('-').map(Number);
    const monthEnd = isoDate(new Date(Date.UTC(y, m, 0)));
    chunks.push({
      month: cursor.slice(0, 7),
      start: cursor,
      end: monthEnd < end ? monthEnd : end,
    });
    cursor = isoDate(new Date(Date.UTC(y, m, 1)));
  }
  return chunks;
}
