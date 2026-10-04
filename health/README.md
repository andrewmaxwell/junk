Health - 2026 - Joining sleep, CPAP, air quality, weather, and journal data to explain how I feel

Questions like "why did I wake up at 5am?", "why did I get a headache?", and "why am I so tired?", answered by joining data from several sources on one timeline.

## Data

Everything lives in `data/`, which is gitignored (this repo is public).

| Source | Where | Since | How it gets there |
|---|---|---|---|
| Journal (Google Form, 0–5 ratings + notes) | `Energy Tracker (Responses) - Form Responses 1.csv` | 2022-04 | Export by hand |
| Headache log (Google Calendar) | `calendar/primary.json` | 2021-08 | `node health/fetchCalendar.js` |
| CPAP (ResMed AirSense 11 SD card) | `cpap/` | 2025-05 nightly, 2026-05 detailed | Copy the SD card by hand |
| Bedroom air (Aranet4) | `Aranet4*.csv` | 2026-07 | Export from the Aranet app by hand |
| Fitbit and phone (Google Health API) | `google/<type>/<YYYY-MM>.jsonl` | 2026-09 (steps 2025-12) | `node health/fetchGoogleHealth.js` |
| Location (Google Maps Timeline) | `Timeline.json` | 2024-08 | Export from the phone: Settings → Location → Timeline → Export |
| Weather and outdoor air quality (Open-Meteo) | `weather/` | 2021-01 | `node health/fetchWeather.js` (also fetches weather where I was on trips, from `Timeline.json`) |
| Journal note tags | `tags/journal-notes.tsv` | 2022-04 | Claude tags them, see `tags/README.md` |
| Life events (surgeries, meds, jobs) | `timeline.tsv` | | Edit by hand |
| What the data means (rating scales, logging habits, routines) | `context.md` | | Read before analyzing |
| Home location for weather | `config.json` | | `{"home": {"latitude", "longitude", "timezone"}}` |

## Building and querying

```sh
node health/fetchGoogleHealth.js && node health/fetchCalendar.js && node health/fetchWeather.js
node health/build.js     # rebuilds data/health.duckdb, about 15 seconds
node health/query.js "select day, energy, headache, cpap_mask_off, ahi, tags from days order by day desc limit 7"
```

`build.js` parses the CPAP EDF files with `ingest/`, then runs `schema.sql`, which reads everything else straight from `data/` with DuckDB. The main table is `days`: one row per date from 2021 with every source summarized. The per-source tables (`heart_rate`, `sleep_stages`, `cpap_events`, `cpap_minutes`, `air`, `weather`, `places`, `travel`, `headaches`, `note_tags`, ...) are there for drilling into a specific night.

`build.js` also writes `data/viz.json`, which `index.html` draws: data coverage, headaches by month, journal trends, every CPAP night, and one night in detail (CPAP, sleep stages, heart rate, leak, CO2, weather). Open it at http://localhost:3000/health/ with `npm run dev`. The data never leaves this machine, so the deployed copy only shows how to set it up. Don't add an `image.png` screenshot, since that would put the data on the public homepage.

### Rules that matter

- **Times** are local wall clock time everywhere, as plain timestamps.
- **The day rule:** a night belongs to the day you wake up on (`night_day(ts)` shifts 12 hours forward). Journal entries describe the day they're written, and ones written after midnight count toward the day before.
- **The CPAP clock** doesn't follow daylight saving time and runs ~6 minutes fast. `ingest/cpap.js` corrects for it, using a value measured against the Fitbit. If the machine's clock gets set, that correction needs a date cutoff.
- **Weather follows me.** Days spent mostly 50+ km from home use weather from where I was, in that place's local time. `slept_km_from_home` and `tz_shift_h` come from where Timeline says I was at 3am.
- **Steps** come from both phone and watch, so the daily total is whichever device counted more.

## Google setup

The `health` Google Cloud project has the Google Health API and Google Calendar API enabled, a consent screen in Testing mode with me as the only test user, and a Desktop OAuth client saved as `data/google-client.json`. The first fetch opens a browser for consent and saves `data/google-token.json`. In Testing mode Google expires that token after 7 days, so expect to click through consent again. The Health API rejects tokens that carry other APIs' scopes, so `googleAuth.js` narrows the token per API.
