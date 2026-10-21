Comfort Map - 2026 - How often each part of the Lower 48 was comfortable for a walk or a sit, scored with Walk Comfort's model.

Each pixel is the share of waking hours (6 AM – 10 PM local) that scored Good or better (70+), hour by hour, with the same `comfort.js` the app uses. Toggle walking or sitting in the shade, step through months, switch to the limiting-factor view to see what cost each place its hours, and hover for both scores and a place name.

The data is fetched and scored ahead of time:

```
node comfort/map/build/fetch.js --days 7 --step 0.5
node comfort/map/build/process.js --days 7 --step 0.5
```

Both take `--start YYYY-MM-DD --end YYYY-MM-DD` instead of `--days`. `fetch.js` caches every piece under `build/cache/` (not committed), so it resumes where it left off after an interruption or a rate limit. `process.js` writes `data/meta.json` and `data/stats.bin`, which are what the page loads.

Weather is from Open-Meteo's Historical Forecast API (the archived forecast models the app reads live, so UV and weather codes are included) and air quality from its Air Quality API. The free tier allows 10,000 calls a day and counts every location as at least one call, so a week at 0.5° (3,734 points) uses most of a day's allowance.
