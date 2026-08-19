import {
  fetchWeatherBundle,
  fetchLocationName,
  describeWeatherCode,
  describeUvIndex,
  weatherIcon,
  fetchTemperatureSpread,
  fetchClimatology,
  searchPlaces,
} from './weather.js';
import {
  scoreComfort,
  comfortScore,
  comfortHeadline,
  comfortReason,
  feltTemperature,
  ACTIVITIES,
  describeHumidity,
  describeAirQuality,
  precipitationRate,
  findBestWindow,
  rainOutlook,
  comfortDelta,
  percentileOf,
  climatologyPhrase,
  UNARCHIVED_FACTORS,
  SCORE_BANDS,
  bandFor,
  FACTOR_LABELS,
} from './comfort.js';
import { renderComfortChart } from './chart.js';
import { thermalStress } from './thermal.js';

// Open-Meteo's current block only advances every 15 minutes, so the old
// once-a-minute poll re-downloaded four days of hourly data to learn nothing.
const REFRESH_MS = 10 * 60 * 1000;
// Coming back to the page is when the numbers matter most, so returning to it
// refreshes on a much shorter fuse than the background poll. Open-Meteo only
// republishes the current-conditions block every 15 minutes, so most of these
// return the same reading — the point is that the one time it *has* moved, the
// card is not showing a number from before you left.
const RETURN_REFRESH_MS = 60 * 1000;
const CHART_PAST_HOURS = 3 * 24;
const CHART_FUTURE_HOURS = 7 * 24;
const COORDS_KEY = 'comfort:coords';
// Offline, the service worker replays the last good response and the card looks
// exactly as confident as it did live. Comparing the observation timestamp in
// the payload to the wall clock is the one check that catches that, whatever
// layer served the bytes.
const STALE_MINUTES = 90;

const RING_RADIUS = 68;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Clear of the progress arc's outer edge and its glow, inside the 90-unit box.
const BAND_RADIUS = 82;
const BAND_CIRCUMFERENCE = 2 * Math.PI * BAND_RADIUS;
const HOUR_MS = 60 * 60 * 1000;

const el = (id) => document.getElementById(id);
const els = Object.fromEntries(
  [
    'location-name', 'location-button', 'place-search', 'place-input', 'place-results', 'place-note',
    'updated', 'activity-toggle', 'ring-bands', 'ring-progress', 'comfort-value', 'comfort-headline',
    'comfort-reason', 'why-toggle', 'why-panel', 'band-scale', 'band-marks', 'why-lead', 'factor-rows',
    'why-note', 'temp', 'feels-like', 'sky-label', 'sky-icon', 'wind', 'rain', 'humidity',
    'air-quality', 'sun', 'daylight', 'daylight-label',
    'wind-label', 'humidity-label', 'air-quality-label', 'sun-label', 'best-window', 'best-window-score',
    'chart-delta', 'comfort-chart', 'day-row', 'chart-tip', 'chart-legend', 'percentile', 'status',
  ].map((id) => [id.replace(/-(\w)/g, (_, c) => c.toUpperCase()), el(id)]),
);

els.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

// `SCORE_BANDS` runs high to low for lookups; drawing wants the other order.
// Paired with each band's upper edge, since a band only knows where it starts.
const BANDS_ASCENDING = [...SCORE_BANDS]
  .sort((a, b) => a.min - b.min)
  .map((band, i, all) => ({ ...band, max: all[i + 1]?.min ?? 100 }));

// The ring track, repainted as the scale itself. A bare 61 asserts a precision
// it cannot deliver and answers none of the questions a reader actually has —
// is that good, how much better is 75 — because nothing on screen said what the
// ends of the scale were. Five arcs in the verdict colours make where the
// progress arc stops readable as a position between two named judgements.
const BAND_GAP = 2.5; // units of track left bare, so the edges are findable

els.ringBands.innerHTML = BANDS_ASCENDING.map((band) => {
  const length = ((band.max - band.min) / 100) * BAND_CIRCUMFERENCE;
  return (
    `<circle class="ring-band" cx="90" cy="90" r="${BAND_RADIUS}" stroke="${band.color}" ` +
    `stroke-dasharray="${(length - BAND_GAP).toFixed(2)} ${BAND_CIRCUMFERENCE.toFixed(2)}" ` +
    `stroke-dashoffset="${(-(band.min / 100) * BAND_CIRCUMFERENCE).toFixed(2)}" />`
  );
}).join('');

// The same scale spelled out, for the one place someone is actually asking what
// the number means. The end labels are pinned to the edges rather than centred
// on their band, which would hang them off the side of the panel.
els.bandScale.innerHTML = BANDS_ASCENDING.map(
  (band) => `<span style="flex:${band.max - band.min};background:${band.color};opacity:0.5"></span>`,
).join('');

els.bandMarks.innerHTML = BANDS_ASCENDING.map((band, i, all) => {
  if (i === 0) return `<span style="left:0;transform:none">${band.label}</span>`;
  if (i === all.length - 1) return `<span style="right:0;left:auto;transform:none">${band.label}</span>`;
  return `<span style="left:${(band.min + band.max) / 2}%">${band.label}</span>`;
}).join('');

const formatTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function renderScore({ score, penalties, limiter }, current, activity) {
  // A missing score is unknown, not bad, so don't paint the ring alarm-red for it.
  const color = score === null ? 'var(--accent)' : bandFor(score).color;
  document.documentElement.style.setProperty('--score-color', color);

  els.comfortValue.textContent = score === null ? '--' : String(score);
  els.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - (score ?? 0) / 100));
  els.comfortHeadline.textContent = comfortHeadline(score, activity);
  els.comfortReason.textContent = comfortReason(current, limiter, penalties, activity);
  renderWhy(score, penalties);

  renderActivityScores(current, activity);
}

// The other answer to "is it nice out", shown on the control that switches to
// it. Always present rather than only when the two disagree, because a reader
// who has to wonder whether the number is missing or merely equal has learned
// nothing — and put here rather than in a line of its own, because a score
// attached to the button that gets you there is a reason to press it.
function renderActivityScores(current, selected) {
  for (const button of els.activityToggle.children) {
    const option = ACTIVITIES[button.dataset.activity];
    const score = option === selected ? null : comfortScore(current, { activity: option });
    button.querySelector('.activity-score').textContent = score === null ? '' : String(score);
  }
}

// Below this a factor is not worth a row: it would draw an empty bar next to a
// "−0" and imply the model was thinking about something it wasn't.
const TRIVIAL_PENALTY = 1;

// The score's whole claim is that it weighed these things for you, and that is
// only worth believing if it will show the working on request.
//
// Deliberately *not* the additive table this invites — temperature +24,
// humidity −12, and so on. Two reasons it would be a lie. Nothing is ever a
// credit: the model starts at 100 and only ever subtracts. And the penalties
// are combined as a root-sum-square, so they genuinely do not add up to the
// total — that is the mechanism that stops one dealbreaker being averaged away
// by four mild pleasantries, and it is worth stating rather than hiding behind
// numbers that happen to sum. So: what each factor cost, ranked, and an honest
// sentence about how they were put together.
function renderWhy(score, penalties) {
  const ranked = Object.entries(penalties)
    .filter(([, cost]) => cost >= TRIVIAL_PENALTY)
    .sort(([, a], [, b]) => b - a);

  els.whyLead.hidden = ranked.length === 0;
  els.factorRows.innerHTML = ranked
    .map(
      ([key, cost]) =>
        '<div class="factor-row">' +
          `<span class="factor-name">${FACTOR_LABELS[key] ?? key}</span>` +
          '<span class="factor-track">' +
            `<span class="factor-fill" style="width:${Math.min(100, cost).toFixed(1)}%"></span>` +
          '</span>' +
          `<span class="factor-cost">−${Math.round(cost)}</span>` +
        '</div>',
    )
    .join('');

  const total = score === null ? null : 100 - score;
  if (total === null) {
    els.whyNote.textContent = '';
  } else if (!ranked.length) {
    els.whyNote.textContent = 'Everything starts at 100, and nothing out there is taking much off.';
  } else if (ranked.length === 1) {
    els.whyNote.textContent =
      `Everything starts at 100. ${FACTOR_LABELS[ranked[0][0]]} is the only thing costing it, ` +
      `and it costs ${total}.`;
  } else {
    els.whyNote.textContent =
      `Everything starts at 100. These combine so the worst one sets the score rather than ` +
      `being averaged away by the rest — together they cost ${total}.`;
  }
}

function renderConditions(current, activity) {
  els.temp.textContent = `${Math.round(current.temperature_2m)}°F`;
  // "Feels like 96°" is a number; "strong heat stress" is UTCI's own published
  // reading of that number, and it is the half that tells you what to do. It is
  // omitted inside the no-stress band so a pleasant day stays quiet.
  // Passed the activity, so switching to sitting in the shade moves this number
  // too. On a clear afternoon the shade is worth 15-25°F of felt heat, and a
  // "feels like" that ignored the shade would sit there contradicting the ring.
  const felt = feltTemperature(current, activity);
  const stress = thermalStress(felt);
  els.feelsLike.textContent =
    felt === null ? 'Feels like –' : `Feels like ${Math.round(felt)}°${stress ? ` · ${stress}` : ''}`;
  els.skyLabel.textContent = describeWeatherCode(current.weather_code);
  // The icon used to be a hardcoded sun-behind-cloud, which sat next to labels
  // like "Clear sky" and "Heavy snow" without ever changing.
  els.skyIcon.innerHTML = weatherIcon(current.weather_code, current.is_day);

  els.wind.textContent = `${Math.round(current.wind_speed_10m)} mph`;
  // Gusts only earn their space when they're meaningfully above sustained wind.
  const gusts = current.wind_gusts_10m;
  els.windLabel.textContent =
    gusts >= current.wind_speed_10m + 8 ? `Gusts ${Math.round(gusts)} mph` : 'Wind';

  // Tiles read as "what it means" over the raw measurement, with the number
  // demoted to the label. One tile instead of two: the old Humidity tile was a
  // dew-point label sitting next to the dew point it was derived from, and long
  // values like "Oppressive · 73° dew" wrapped and broke the grid alignment.
  setTile(els.humidity, els.humidityLabel, describeHumidity(current.dew_point_2m),
    current.dew_point_2m, (v) => `${Math.round(v)}° dew point`, 'Humidity');
  setTile(els.airQuality, els.airQualityLabel, describeAirQuality(current.us_aqi),
    current.us_aqi, (v) => `AQI ${Math.round(v)}`, 'Air quality');
  setTile(els.sun, els.sunLabel, describeUvIndex(current.uv_index),
    current.uv_index, (v) => `UV index ${Math.round(v)}`, 'Sun');
}

function setTile(valueEl, labelEl, value, measurement, formatLabel, fallbackLabel) {
  valueEl.textContent = value;
  labelEl.textContent = Number.isFinite(measurement) ? formatLabel(measurement) : fallbackLabel;
}

// "3h 22m of daylight left" is a decision; a sunrise and a sunset time are two
// facts you have to do arithmetic on. Only one of them is ever the useful one.
function renderDaylight({ now, sunrise, sunset, nextSunrise }) {
  if (sunrise && now < sunrise) {
    els.daylight.textContent = formatTime(sunrise);
    els.daylightLabel.textContent = 'Sunrise';
  } else if (sunset && now < sunset) {
    els.daylight.textContent = formatDuration(sunset - now);
    els.daylightLabel.textContent = 'Daylight left';
  } else if (nextSunrise) {
    els.daylight.textContent = formatTime(nextSunrise);
    els.daylightLabel.textContent = 'Sunrise';
  } else {
    els.daylight.textContent = '–';
    els.daylightLabel.textContent = 'Daylight';
  }
}

function renderBestWindow(best, now, currentScore) {
  if (!best) {
    els.bestWindow.textContent = '–';
    els.bestWindowScore.textContent = '';
    return;
  }
  const isNow = best.start.getTime() <= now.getTime();
  els.bestWindow.textContent = isNow ? `Now · ${best.label}` : best.label;
  // The score is the point: it tells you whether waiting actually buys anything.
  els.bestWindowScore.textContent =
    currentScore !== null && best.score <= currentScore + 3
      ? `comfort ${best.score} · no better window ahead`
      : `comfort ${best.score}`;
}

// Runs the ensemble's temperature spread back through the comfort model, which
// is more honest than showing the spread in degrees: 4°F of uncertainty barely
// moves a mild day and can swing a hot one by thirty points.
//
// The spread is on air temperature, and air temperature is now what the thermal
// model starts from, so the offset goes on directly — the soil temperature
// moves with it, since ground that warm-or-cool is the same story the air is
// telling and leaving it fixed would damp the very swing being drawn.
function scoreBand(row, offsets, activity) {
  if (!offsets) return undefined;
  const ends = [offsets.low, offsets.high].map((offset) =>
    comfortScore(
      {
        ...row,
        temperature_2m: row.temperature_2m + offset,
        soil_temperature_0cm: Number.isFinite(row.soil_temperature_0cm)
          ? row.soil_temperature_0cm + offset
          : null,
      },
      { activity },
    ),
  );
  if (ends.some((score) => score === null)) return undefined;
  // Warmer is not always worse, so the band's edges are not fixed to low/high.
  return [Math.min(...ends), Math.max(...ends)];
}

function renderChart(bundle, spread, now, bestWindow, activity, otherActivity) {
  const from = now.getTime() - CHART_PAST_HOURS * HOUR_MS;
  const to = now.getTime() + CHART_FUTURE_HOURS * HOUR_MS;
  const points = bundle.rows
    .filter((row) => row.time.getTime() >= from && row.time.getTime() <= to)
    .map((row) => {
      const selected = scoreComfort(row, { activity });
      return {
        ...row,
        score: selected.score,
        limiter: selected.limiter,
        otherScore: comfortScore(row, { activity: otherActivity }),
        rate: precipitationRate(row),
        band: scoreBand(row, spread.get(row.key), activity),
      };
    });

  renderComfortChart(els.comfortChart, els.dayRow, els.chartTip, els.chartLegend, points, {
    now,
    bestWindow,
    activity,
    otherActivity,
  });
  els.comfortChart.setAttribute(
    'aria-label',
    `${activity.label} and ${otherActivity.label.toLowerCase()} comfort scores from ` +
      `${CHART_PAST_HOURS / 24} days ago through the next ${CHART_FUTURE_HOURS / 24} days.`,
  );
}

// How today reads against the same slice of the calendar in recent years. The
// archive lacks UV and air quality, so both sides drop those factors.
const PERCENTILE_QUALIFIERS = [
  [85, 'Exceptional'],
  [70, 'Better than usual'],
  [40, 'About typical'],
  [15, 'Worse than usual'],
  [0, 'Unusually bad'],
];

// The archive rows are cached rather than the scores computed from them: five
// requests are worth avoiding, but re-scoring a few hundred rows is free, and
// caching the scores meant a percentile computed for walking survived a switch
// to sitting and answered the wrong question in the right sentence.
let climatology = { key: null, rows: [], pending: null };

async function renderPercentile(current, now, activity) {
  const key = `${coords.lat},${coords.lon},${now.toDateString()},${now.getHours()}`;
  try {
    if (climatology.key !== key) {
      // Guarded so a refresh landing mid-flight doesn't fire five more requests.
      climatology.pending ??= fetchClimatology(coords.lat, coords.lon, now);
      const rows = await climatology.pending;
      climatology = { key, pending: null, rows };
    }

    const scored = { activity, exclude: UNARCHIVED_FACTORS };
    const samples = climatology.rows
      .map((row) => comfortScore(row, scored))
      .filter((score) => score !== null);

    const comparable = comfortScore(current, scored);
    const percentile = percentileOf(comparable, samples);
    els.percentile.textContent =
      percentile === null
        ? ''
        : `${PERCENTILE_QUALIFIERS.find(([min]) => percentile >= min)[1]} for ` +
          `${climatologyPhrase(now)} here · better than ${percentile}% of them`;
  } catch {
    climatology.pending = null;
    els.percentile.textContent = '';
  }
}

let coords = null;
let refreshTimer = null;
let lastUpdate = 0;
let activity = ACTIVITIES.walk;
// The last good fetch, kept so switching activity is a re-render rather than a
// round trip: every number on the card is derivable from data already in hand.
let latest = null;

const otherActivity = () => (activity === ACTIVITIES.walk ? ACTIVITIES.sit : ACTIVITIES.walk);

function render() {
  if (!latest) return;
  const { bundle, spread } = latest;
  const { now, current, history, upcoming } = bundle;
  const other = otherActivity();
  const result = scoreComfort(current, { activity });

  renderScore(result, current, activity);
  renderConditions(current, activity);
  renderDaylight(bundle);
  els.rain.textContent = rainOutlook(current, upcoming, { now });
  const bestWindow = findBestWindow(upcoming, { now, activity });
  renderBestWindow(bestWindow, now, result.score);
  renderChart(bundle, spread, now, bestWindow, activity, other);

  const delta = comfortDelta(history, result.score, now, activity);
  els.chartDelta.textContent =
    delta === null || delta === 0 ? '' : `${delta > 0 ? '↑' : '↓'}${Math.abs(delta)} vs yesterday`;
  els.chartDelta.classList.toggle('is-down', delta !== null && delta < 0);

  const ageMinutes = (now - current.time) / 60_000;
  els.updated.textContent =
    ageMinutes > STALE_MINUTES
      ? `Last reading ${formatTime(current.time)}`
      : `Updated ${formatTime(now)}`;

  // Five archive requests on a cold cache, so it runs after the card is up.
  renderPercentile(current, now, activity);
}

async function update() {
  if (!coords) return;
  try {
    const [bundle, spread] = await Promise.all([
      fetchWeatherBundle(coords.lat, coords.lon),
      fetchTemperatureSpread(coords.lat, coords.lon),
    ]);
    latest = { bundle, spread };
    els.status.textContent = '';
    lastUpdate = Date.now();
    render();
  } catch (err) {
    // Leave the last good render on screen rather than blanking the card.
    els.status.textContent = `Couldn't refresh: ${err.message}`;
  }
}

// --- Activity ---------------------------------------------------------------
//
// The model has always had two activities and the card has always shown both
// numbers; what it had no way to say is which one you came here to ask about.
// Everything downstream — the ring, the sentence, the best window, the bold
// line on the chart, even the felt temperature, since one of the two sits in
// shade — follows the answer.
function buildActivityToggle() {
  els.activityToggle.innerHTML = Object.values(ACTIVITIES)
    .map(
      (option) =>
        `<button type="button" class="activity-option" data-activity="${option.key}" ` +
        `aria-pressed="${option === activity}">${option.short}` +
        '<span class="activity-score"></span></button>',
    )
    .join('');

  els.activityToggle.addEventListener('click', (event) => {
    const key = event.target.closest('[data-activity]')?.dataset.activity;
    if (!key || ACTIVITIES[key] === activity) return;
    activity = ACTIVITIES[key];
    for (const button of els.activityToggle.children) {
      button.setAttribute('aria-pressed', String(button.dataset.activity === key));
    }
    render();
  });
}

function startRefreshing() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(update, REFRESH_MS);
}

// Catch up whenever the reader comes back, and stop polling while they are gone.
//
// This used to hang off `visibilitychange` alone, registered part-way down
// `init` — past two early returns, one of which is the ordinary path for anyone
// with a stored place. So the common case wired nothing: the timer kept firing
// into a hidden tab and a return from one showed whatever was last drawn.
//
// `visibilitychange` would not have been enough on its own either. It fires for
// tab switches and for a phone waking up, and not for the most ordinary return
// there is on a desktop — clicking from another window back into this one, where
// the tab was never hidden for a moment.
function wireRefreshOnReturn() {
  // Coming back to a window fires two of the three listeners below in the same
  // tick, and `lastUpdate` is only written once a fetch has come back, so both
  // would read the same stale timestamp and both would fetch. Recording the
  // attempt synchronously is what collapses them — and it belongs here rather
  // than inside `update`, which is also how a place change asks for new data
  // and must never be answered with the old place's request.
  let lastAttempt = 0;

  const returned = () => {
    if (!coords) return;
    const now = Date.now();
    if (now - Math.max(lastUpdate, lastAttempt) > RETURN_REFRESH_MS) {
      lastAttempt = now;
      update();
    }
    // Restarted so the slow poll is measured from the last time anyone looked,
    // rather than from whenever the page happened to open.
    startRefreshing();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(refreshTimer);
    else returned();
  });
  window.addEventListener('focus', returned);
  // A back/forward restore can run no script at all, so it can put a card built
  // an hour ago back on screen with none of its timers still alive.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) returned();
  });
}

function useCoords({ lat, lon, name = null }, { remember = true } = {}) {
  coords = { lat, lon, name };
  if (remember) localStorage.setItem(COORDS_KEY, JSON.stringify(coords));

  // A place picked by name is already named. Running it back through the
  // reverse geocoder only risks answering with a different one, which reads as
  // the app having ignored what you asked for.
  if (name) {
    els.locationName.textContent = name;
  } else {
    fetchLocationName(lat, lon).then((resolved) => {
      els.locationName.textContent = resolved;
    });
  }

  // Nothing measured at the old place describes the new one.
  latest = null;
  climatology = { key: null, rows: [], pending: null };
  els.status.textContent = 'Loading…';
  update();
  startRefreshing();
}

function readCachedCoords() {
  try {
    const cached = JSON.parse(localStorage.getItem(COORDS_KEY) ?? 'null');
    return Number.isFinite(cached?.lat) && Number.isFinite(cached?.lon) ? cached : null;
  } catch {
    return null;
  }
}

// --- Place search -----------------------------------------------------------
//
// The app could previously only ever answer for wherever the device was
// standing, which is the wrong question the evening before a trip and no
// question at all when the location prompt has been denied.
const SEARCH_DEBOUNCE_MS = 250;

let searchTimer = null;
let searchResults = [];

function openPlaceSearch(open) {
  els.placeSearch.hidden = !open;
  els.locationButton.setAttribute('aria-expanded', String(open));
  if (open) {
    els.placeInput.focus();
    els.placeInput.select();
  } else {
    clearTimeout(searchTimer);
    els.placeResults.innerHTML = '';
    els.placeNote.innerHTML = '';
    searchResults = [];
  }
}

function renderPlaceNote(text) {
  els.placeNote.innerHTML = '';
  if (text) els.placeNote.append(`${text} `);
  const here = document.createElement('button');
  here.type = 'button';
  here.className = 'link-button';
  here.textContent = 'Use my location';
  here.addEventListener('click', () => {
    openPlaceSearch(false);
    requestLocation();
  });
  els.placeNote.append(here);
}

async function runPlaceSearch(query) {
  if (query.trim().length < 2) {
    els.placeResults.innerHTML = '';
    renderPlaceNote('');
    return;
  }
  try {
    const places = await searchPlaces(query);
    // A slow response for a query that has since been typed past must not
    // overwrite the results for what is in the box now.
    if (els.placeInput.value !== query) return;
    searchResults = places;
    els.placeResults.innerHTML = places
      .map(
        (place, i) =>
          `<li><button type="button" class="place-option" data-place="${i}">` +
          `<span>${place.name}</span><span class="detail">${place.detail}</span>` +
          '</button></li>',
      )
      .join('');
    renderPlaceNote(places.length ? '' : 'No places found.');
  } catch {
    if (els.placeInput.value !== query) return;
    els.placeResults.innerHTML = '';
    renderPlaceNote('Search is unavailable right now.');
  }
}

function wirePlaceSearch() {
  els.locationButton.addEventListener('click', () => {
    openPlaceSearch(els.placeSearch.hidden);
  });

  els.placeInput.addEventListener('input', () => {
    const query = els.placeInput.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runPlaceSearch(query), SEARCH_DEBOUNCE_MS);
  });

  els.placeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') openPlaceSearch(false);
  });

  els.placeResults.addEventListener('click', (event) => {
    const index = event.target.closest('[data-place]')?.dataset.place;
    if (index === undefined) return;
    const place = searchResults[Number(index)];
    openPlaceSearch(false);
    useCoords({ lat: place.lat, lon: place.lon, name: place.name });
  });
}

function requestLocation() {
  els.status.textContent = 'Getting your location…';
  els.locationName.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    ({ coords: { latitude, longitude } }) => useCoords({ lat: latitude, lon: longitude }),
    (err) => {
      // A denied prompt used to leave a permanently empty card. The last known
      // position is nearly always still the right answer.
      const cached = readCachedCoords();
      if (cached) {
        els.status.textContent = 'Using your last known location.';
        useCoords(cached, { remember: false });
      } else {
        // Not a dead end any more: there is a search box behind the header.
        els.locationName.textContent = 'Choose a place';
        els.status.innerHTML = '';
        els.status.append(`Location unavailable (${err.message}). `);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'link-button';
        retry.textContent = 'Try again';
        retry.addEventListener('click', requestLocation);
        els.status.append(retry);
        els.status.append(' or ');
        const search = document.createElement('button');
        search.type = 'button';
        search.className = 'link-button';
        search.textContent = 'search for a place';
        search.addEventListener('click', () => openPlaceSearch(true));
        els.status.append(search);
      }
    },
    { maximumAge: 5 * 60 * 1000, timeout: 10_000 },
  );
}

// Requires a secure context, so it is a no-op when the page is opened straight
// off the filesystem. Failing to register must never take the page down with it.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function init() {
  registerServiceWorker();
  buildActivityToggle();
  wirePlaceSearch();
  // Before the early returns below, both of which are ordinary paths.
  wireRefreshOnReturn();

  els.whyToggle.addEventListener('click', () => {
    const open = els.whyPanel.hidden;
    els.whyPanel.hidden = !open;
    els.whyToggle.setAttribute('aria-expanded', String(open));
    els.whyToggle.textContent = open ? 'Hide the breakdown' : 'Why this score?';
  });

  // A stored place is a decision the reader already made; re-asking the browser
  // for a location would quietly move them back home on every reload.
  const cached = readCachedCoords();
  if (cached?.name) {
    useCoords(cached, { remember: false });
    return;
  }

  if (!navigator.geolocation) {
    els.status.textContent = 'This browser cannot report your location.';
    els.locationName.textContent = 'Choose a place';
    openPlaceSearch(true);
    return;
  }

  requestLocation();
}

init();
