Comfort Map - 2026 - How often each part of the Lower 48 was comfortable for a walk or a sit, scored with Walk Comfort's model.

Each pixel is one 3 km cell, colored by the share of waking hours (6 AM – 10 PM local) that scored Good or better (70+), hour by hour, with the same `comfort.js` the app uses. Toggle walking or sitting in the shade, step through months, switch to the limiting-factor view to see what cost each place its hours, and hover for both scores and a place name.

## Data

- Weather: NOAA's HRRR model on AWS (3 km, hourly). Each hour's one-hour forecast supplies temperature, dew point, wind, gusts, cloud, radiation, ground temperature, precipitation and its type, and lightning. Only those fields are fetched, about 17 MB an hour, by byte range.
- UV index and US AQI: Copernicus CAMS global forecasts (0.4°), interpolated onto the HRRR grid. AQI is the larger of 24-hour PM2.5 and 8-hour ozone on the EPA scale.

## Building

The download, conversion and grid steps are Python (`build/.venv`, with `cdsapi xarray netCDF4 numpy eccodes shapely timezonefinder`). Scoring is Node, so it runs the app's own model. CAMS needs a free Copernicus account with the key in `~/.cdsapirc` and the CAMS licence accepted on the Atmosphere Data Store.

```
cd comfort/map/build
.venv/bin/python grid.py                                  # once: cells, lat/lon, time zones
.venv/bin/python cams.py --start 2025-10-20 --end 2026-10-19
node score.js --start 2025-10-20 --end 2026-10-19         # runs hrrr.py itself
```

`score.js` streams hours from `hrrr.py` (about 1 s each to fetch), scores them across all but one core and checkpoints once per day of data, so an interrupted run resumes when started again with the same dates. A year takes about 5 hours, mostly scoring. It writes `data/meta.json` and one PNG per period and activity. Those PNGs are data, not pictures: red is the share of Good hours (0–200), green the mean score, and blue the index of the factor that cost the most hours.
