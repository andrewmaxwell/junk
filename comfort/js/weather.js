const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const PLACE_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const REQUEST_TIMEOUT_MS = 10_000;

// The comfort model needs every one of these for every hour, not just for right
// now, so the two lists stay in step; the old hourly set forced the forecast and
// the current score to be computed from different inputs.
//
// The radiation block and `soil_temperature_0cm` are what mean radiant
// temperature is built from — how much sun is actually landing on you and how
// hot the ground under you is radiating back. `apparent_temperature` is gone:
// UTCI supersedes it, and keeping a second, differently-calibrated "feels like"
// around invites the two to disagree in the UI.
const THERMAL_FIELDS = [
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
];

const COMMON_FIELDS = [...THERMAL_FIELDS, 'uv_index', 'precipitation', 'weather_code', 'is_day'];

const HOURLY_FIELDS = [...COMMON_FIELDS, 'precipitation_probability'].join(',');
const CURRENT_FIELDS = COMMON_FIELDS.join(',');

async function fetchJson(url, label) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${label} request failed (${res.status})`);
  return res.json();
}

// Open-Meteo with `timezone=auto` returns naive local-time strings, which
// `new Date()` parses in the *browser's* zone. That is what we want for
// `getHours()` (it yields the hour where the weather is), but it means
// `Date.now()` is the wrong reference for "now" whenever the browser and the
// forecast location disagree, whether travelling or behind a VPN. This shifts
// the real instant into the same naive frame so the two are comparable.
function wallClockNow(utcOffsetSeconds) {
  const nowMs = Date.now();
  const browserOffsetMs = new Date(nowMs).getTimezoneOffset() * 60_000;
  return new Date(nowMs + utcOffsetSeconds * 1000 + browserOffsetMs);
}

// Turns Open-Meteo's parallel arrays into an array of row objects.
function toRows(block, fields) {
  return block.time.map((time, i) => {
    const row = { time: new Date(time), key: time };
    for (const field of fields) row[field] = block[field]?.[i] ?? null;
    return row;
  });
}

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Air quality is a genuinely useful walking signal (ozone days, wildfire smoke)
// but it lives on a second endpoint, so a failure here degrades the app rather
// than breaking it: the comfort model simply drops the factor.
async function fetchAirQuality(lat, lon, pastDays) {
  try {
    const data = await fetchJson(
      `${AIR_QUALITY_URL}?latitude=${lat}&longitude=${lon}` +
        `&current=us_aqi&hourly=us_aqi&timezone=auto&past_days=${pastDays}&forecast_days=7`,
      'Air quality',
    );
    const byHour = new Map();
    data.hourly.time.forEach((time, i) => byHour.set(time, data.hourly.us_aqi[i]));
    return { current: data.current?.us_aqi ?? null, byHour };
  } catch {
    return { current: null, byHour: new Map() };
  }
}

const HOURS_PER_DAY = 24;

// The air-quality forecast runs a day or so shorter than the weather forecast.
// Leaving those hours empty would drop the air penalty to zero right where
// coverage ends, putting a step up in the comfort line that no weather caused.
// Carrying the same clock hour forward from the previous day keeps the daily
// ozone cycle intact, which a single flat carried-forward value would not.
function fillAirQualityForward(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (Number.isFinite(rows[i].us_aqi)) continue;
    for (let back = i - HOURS_PER_DAY; back >= 0; back -= HOURS_PER_DAY) {
      if (Number.isFinite(rows[back].us_aqi)) {
        rows[i].us_aqi = rows[back].us_aqi;
        break;
      }
    }
  }
}

// Three days of history, because the chart draws them: seeing that the last two
// afternoons were also unwalkable is the context that tells you whether today is
// a heatwave or a bad Tuesday.
export async function fetchWeatherBundle(lat, lon, { historyDays = 3, forecastDays = 8 } = {}) {
  const forecastUrl =
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    `&current=${CURRENT_FIELDS}` +
    `&hourly=${HOURLY_FIELDS}` +
    '&daily=sunrise,sunset' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto' +
    `&past_days=${historyDays}&forecast_days=${forecastDays}`;

  const [data, airQuality] = await Promise.all([
    fetchJson(forecastUrl, 'Weather'),
    fetchAirQuality(lat, lon, historyDays),
  ]);

  const now = wallClockNow(data.utc_offset_seconds);

  const rows = toRows(data.hourly, HOURLY_FIELDS.split(','));
  for (const row of rows) row.us_aqi = airQuality.byHour.get(row.key) ?? null;
  fillAirQualityForward(rows);

  const current = {
    ...data.current,
    time: new Date(data.current.time),
    us_aqi: airQuality.current,
  };

  const nowMs = now.getTime();
  const history = rows.filter((row) => row.time.getTime() <= nowMs);
  // Starts at the hour in progress, so "best window" and "rain outlook" can both
  // legitimately answer "right now".
  const upcoming = rows.filter((row) => row.time.getTime() + 60 * 60 * 1000 > nowMs);

  const days = data.daily.time;
  const todayIdx = days.indexOf(dateKey(now));
  const sunAt = (arr, idx) => (idx >= 0 && arr[idx] ? new Date(arr[idx]) : null);

  return {
    now,
    current,
    rows,
    history,
    upcoming,
    sunrise: sunAt(data.daily.sunrise, todayIdx),
    sunset: sunAt(data.daily.sunset, todayIdx),
    nextSunrise: sunAt(data.daily.sunrise, todayIdx + 1),
  };
}

// The US civil township: a census division that is nobody's address. Michigan
// spells it "Charter Township of".
const CIVIL_TOWNSHIP = /^(charter )?township of /i;

// `city` is the right field almost everywhere — St. Louis, London, Tokyo,
// Reykjavik all answer correctly — so the fix for the one case it gets wrong
// has to be narrow. Across suburban and rural America it returns the containing
// civil township instead of the town: at 38.80,-90.40 it says "Township of
// Northwest" where the place is called Hazelwood, and the header spent thirty
// characters saying it.
//
// `locality` is the more specific field and it is *not* a general improvement:
// it turns New York City into Manhattan, London into City of Westminster and
// Tokyo into Shinjuku. So it is consulted only when `city` has answered with a
// township, and only accepted when it has not answered with one too — out in
// rural Kansas both fields say township, because there is genuinely nothing
// else out there to call it.
function municipality(data) {
  const { city, locality } = data;
  if (city && CIVIL_TOWNSHIP.test(city) && locality && !CIVIL_TOWNSHIP.test(locality)) {
    return locality;
  }
  return city || locality;
}

// Falls back to raw coordinates if the reverse-geocode lookup fails.
export async function fetchLocationName(lat, lon) {
  const coords = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  try {
    const data = await fetchJson(
      `${GEOCODE_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      'Location',
    );
    const city = municipality(data);
    if (!city) return data.countryName || coords;
    // The ISO subdivision suffix is only useful when it's an actual
    // abbreviation. Singapore returns "SG-03", which reads as noise beside a city.
    const code = data.principalSubdivisionCode?.split('-')[1];
    const region = /^[A-Za-z]{2,3}$/.test(code ?? '') ? code : data.principalSubdivision;
    return region && region !== city ? `${city}, ${region}` : city;
  } catch {
    return coords;
  }
}

// Forward geocoding. Until now the app could only ever answer for wherever the
// phone happened to be, which is the wrong question the day before a trip and
// unanswerable at all when the location prompt is denied.
//
// Open-Meteo's own geocoder rather than the reverse-geocode service above: it
// takes a name, it is the same provider as the forecast, and it returns the
// admin hierarchy needed to tell the four Springfields apart.
export async function searchPlaces(query, { count = 6 } = {}) {
  const name = query.trim();
  if (name.length < 2) return [];
  const data = await fetchJson(
    `${PLACE_SEARCH_URL}?name=${encodeURIComponent(name)}&count=${count}&language=en&format=json`,
    'Place search',
  );
  return (data.results ?? []).map((place) => ({
    lat: place.latitude,
    lon: place.longitude,
    name: place.name,
    // admin1 is the state or province, which is the one that disambiguates in
    // practice; the country only matters once you have left it.
    detail: [place.admin1, place.country].filter(Boolean).join(', '),
  }));
}

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail',
};

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] ?? '–';
}

export function describeUvIndex(uvIndex) {
  if (!Number.isFinite(uvIndex)) return '–';
  if (uvIndex < 3) return 'Low';
  if (uvIndex < 6) return 'Moderate';
  if (uvIndex < 8) return 'High';
  if (uvIndex < 11) return 'Very high';
  return 'Extreme';
}

// Sky icons. Previously the card drew one hardcoded sun-behind-cloud glyph no
// matter what the sky was doing, so "Clear sky" and "Heavy snow" looked alike.
const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2M12 18.8v2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M3.2 12h2M18.8 12h2M5.8 18.2l1.4-1.4M16.8 7.2l1.4-1.4"/>';
const MOON = '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>';
const CLOUD = '<path d="M17.5 18.5a4 4 0 0 0-.5-8 5.2 5.2 0 0 0-9.9-1.4A4.2 4.2 0 0 0 6.5 17h11Z"/>';
const SMALL_CLOUD = '<path d="M17.5 17.5a3.6 3.6 0 0 0-.5-7.2 4.7 4.7 0 0 0-8.9-1.2A3.8 3.8 0 0 0 7.5 16.5h10Z" fill="var(--card)"/>';
const partly = (orb) => `<g transform="translate(-2.5,-2) scale(0.72)">${orb}</g>${SMALL_CLOUD}`;
const drops = '<path d="M9 19.5 8 22M13 19.5 12 22"/>';
const flakes = '<path d="M9 20h.01M12.5 21h.01M16 20h.01"/>';
const bolt = '<path d="M12.5 14 10 19h3l-1.5 4"/>';

// Ordered most-specific first; the first matching band wins.
const ICON_BANDS = [
  [[95, 96, 99], () => CLOUD + bolt],
  [[71, 73, 75, 77, 85, 86], () => CLOUD + flakes],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], () => CLOUD + drops],
  [[45, 48], () => '<path d="M4 9h16M4 13h16M6 17h12"/>'],
  [[3], () => CLOUD],
  [[2], (isDay) => partly(isDay ? SUN : MOON)],
  [[0, 1], (isDay) => (isDay ? SUN : MOON)],
];

export function weatherIcon(code, isDay = 1) {
  const band = ICON_BANDS.find(([codes]) => codes.includes(code));
  return band ? band[1](isDay === 1) : CLOUD;
}

// --- Forecast uncertainty ---------------------------------------------------

const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';
const SPREAD_LOW_PERCENTILE = 0.1;
const SPREAD_HIGH_PERCENTILE = 0.9;

const percentileAt = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

// A single forecast line drawn to day seven implies a confidence nobody has.
// GFS runs 31 ensemble members; the spread between them is the honest width of
// the guess, and it widens with lead time exactly as you would expect.
//
// Returns offsets in °F from the ensemble median rather than absolute values,
// so they can be laid over the deterministic forecast without importing that
// model's bias along with its spread.
export async function fetchTemperatureSpread(lat, lon) {
  const offsets = new Map();
  try {
    const data = await fetchJson(
      `${ENSEMBLE_URL}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m` +
        '&models=gfs025&temperature_unit=fahrenheit&timezone=auto&forecast_days=7',
      'Ensemble',
    );

    const members = Object.keys(data.hourly).filter((key) => key.includes('_member'));
    if (members.length < 5) return offsets;

    data.hourly.time.forEach((time, i) => {
      const values = members.map((key) => data.hourly[key][i]).filter(Number.isFinite).sort((a, b) => a - b);
      if (values.length < 5) return;
      const median = percentileAt(values, 0.5);
      offsets.set(time, {
        low: percentileAt(values, SPREAD_LOW_PERCENTILE) - median,
        high: percentileAt(values, SPREAD_HIGH_PERCENTILE) - median,
      });
    });
  } catch {
    // No band drawn is better than a fabricated one.
  }
  return offsets;
}

// --- Historical context -----------------------------------------------------

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const CLIMATOLOGY_YEARS = 5;
const CLIMATOLOGY_DAY_RADIUS = 7; // calendar days either side of today
const CLIMATOLOGY_HOUR_RADIUS = 2; // hours either side of the current hour

// ERA5 carries no UV index and no air quality, which is why the comparison runs
// with those factors excluded on both sides. See UNARCHIVED_FACTORS. It does
// carry the radiation fluxes, so the thermal half of the score is computed
// identically on both sides — the archive's soil temperature just lives under a
// different name, which `meanRadiantTemperature` accepts.
const ARCHIVE_FIELDS = [
  ...THERMAL_FIELDS.filter((field) => field !== 'soil_temperature_0cm'),
  'soil_temperature_0_to_7cm',
  'precipitation',
  'weather_code',
  'is_day',
].join(',');

const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Pulls the same slice of the calendar from each of the last few years so
// "is this a good day for here, at this time of year?" has an answer. One
// request per year, all in flight together; a year that fails is skipped.
export async function fetchClimatology(lat, lon, now) {
  const thisYear = now.getFullYear();
  const requests = [];

  for (let offset = 1; offset <= CLIMATOLOGY_YEARS; offset++) {
    const centre = new Date(now);
    centre.setFullYear(thisYear - offset);
    const start = new Date(centre);
    start.setDate(start.getDate() - CLIMATOLOGY_DAY_RADIUS);
    const end = new Date(centre);
    end.setDate(end.getDate() + CLIMATOLOGY_DAY_RADIUS);

    requests.push(
      fetchJson(
        `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}` +
          `&start_date=${isoDate(start)}&end_date=${isoDate(end)}` +
          `&hourly=${ARCHIVE_FIELDS}` +
          '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto',
        'Archive',
      ).catch(() => null),
    );
  }

  const results = await Promise.all(requests);
  const rows = [];
  const targetHour = now.getHours();

  for (const data of results) {
    if (!data?.hourly?.time) continue;
    const fields = ARCHIVE_FIELDS.split(',');
    data.hourly.time.forEach((time, i) => {
      const at = new Date(time);
      // Compare like with like: an August afternoon against other August
      // afternoons, not against the 4 AM lows that would flatter any daytime score.
      if (Math.abs(at.getHours() - targetHour) > CLIMATOLOGY_HOUR_RADIUS) return;
      const row = { time: at };
      for (const field of fields) row[field] = data.hourly[field]?.[i] ?? null;
      rows.push(row);
    });
  }
  return rows;
}
