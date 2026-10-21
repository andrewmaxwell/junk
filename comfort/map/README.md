Comfort Map - 2026 - How often each part of the Lower 48 was comfortable for a walk or a sit, month by month, scored with Walk Comfort's model.

Each pixel is one 3 km cell, colored by the share of waking hours (6 AM – 10 PM local) that scored Good or better (70+), hour by hour, with the same `comfort.js` the app uses. It opens on the current month. Press play to watch the seasons move, switch between walking and sitting in the shade, or color by what cost each place its hours. The color scale is fixed at 0–100%, so colors mean the same thing in every month.

Click anywhere, search a town or pick an example to see that place's year: a bar per month showing the share of Good hours and what spoiled the rest (heat, cold, rain, storms…), with the other activity drawn as a line. Tap a month in the chart to show it on the map. Pinch or ⌘/Ctrl-scroll to zoom down to individual 3 km cells. The URL keeps the activity, view, month, place and zoom, so a link shows what you saw.

## Data

- Weather: NOAA's HRRR model on AWS (3 km, hourly), Oct 20, 2025 – Oct 19, 2026. Each hour's one-hour forecast supplies temperature, dew point, wind, gusts, cloud, radiation, ground temperature, precipitation and its type, and lightning. Only those fields are fetched, about 17 MB an hour, by byte range.
- UV index and US AQI: Copernicus CAMS global forecasts (0.4°), interpolated onto the HRRR grid. AQI is the larger of 24-hour PM2.5 and 8-hour ozone on the EPA scale.
- Each month is one year's weather, not a long-term average. October is Oct 20–31, 2025 plus Oct 1–19, 2026.
- Place profiles are for 9 km blocks (3×3 cells), so they can differ by a point or two from the 3 km value under the pointer.

## Checking it

`build/check.js` scores the same hours at 12 cities from an independent source, Open-Meteo's archive (ECMWF reanalysis, with CAMS UV and AQI), using the same model. It then compares the result with the map's nearest cell over the 11 whole months (Nov–Sep). The latest run:

| | walk: map | archive | sit: map | archive |
|---|---|---|---|---|
| Newport, OR | 86% | 87% | 47% | 63% |
| Seattle, WA | 83% | 81% | 65% | 64% |
| San Francisco, CA | 92% | 93% | 82% | 83% |
| San Diego, CA | 77% | 73% | 98% | 98% |
| Phoenix, AZ | 40% | 42% | 70% | 69% |
| Denver, CO | 62% | 64% | 63% | 67% |
| Minneapolis, MN | 52% | 50% | 47% | 47% |
| Chicago, IL | 60% | 54% | 43% | 50% |
| Dallas, TX | 52% | 50% | 68% | 65% |
| Atlanta, GA | 57% | 55% | 72% | 70% |
| Miami, FL | 43% | 38% | 88% | 83% |
| New York, NY | 56% | 56% | 51% | 52% |

On average the map differs from the archive by 2 points for walking and 3 for sitting, with almost no bias either way. The largest gap is sitting on the Oregon coast: the coastal HRRR cell is windier and cooler than the archive's 25 km cell, which reaches inland.

## Building

The download, conversion and grid steps are Python (`build/.venv`, with `cdsapi xarray netCDF4 numpy eccodes shapely timezonefinder`). Scoring is Node, so it runs the app's own model. CAMS needs a free Copernicus account with the key in `~/.cdsapirc` and the CAMS licence accepted on the Atmosphere Data Store.

```
cd comfort/map/build
.venv/bin/python grid.py                                  # once: cells, lat/lon, time zones
.venv/bin/python cams.py --start 2025-10-20 --end 2026-10-19
node score.js --start 2025-10-20 --end 2026-10-19         # runs hrrr.py, then export.js
node check.js --start 2025-10-20 --end 2026-10-19         # optional: compare with the archive
```

`score.js` streams hours from `hrrr.py` (about 1 s each to fetch), scores them across all but one core and checkpoints once per day of data, so an interrupted run resumes when started again with the same dates. A year takes about 5 hours, mostly scoring. The checkpoint holds hour counts per cell, activity, month and factor.

`export.js` turns the checkpoint into what the page loads, in about 10 seconds, so changing the output never means scoring again. It writes `data/meta.json`, one PNG per period (year and each calendar month) and activity, and gzipped profile tiles in `data/profile/`. The PNGs are data, not pictures: red is the percent of Good hours and green the index of the factor that cost the most hours. The full format is in the comment at the top of `export.js`.
