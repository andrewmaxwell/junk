Windows Open - 2026 - How much of the year you could have left the windows open, everywhere on Earth, from hourly weather and air quality.

A path-traced map of the world's land in columns, each as tall as the share of all hours, day and night, from Nov 1, 2025 to Oct 31, 2026, when the windows could have been open. An hour counts when:

- the air was 62–80°F,
- the dew point was under 63°F (not muggy),
- less than 1 mm of rain fell, and
- there was no dust or smoke: CAMS PM10 under 154 µg/m³ and PM2.5 under 35.4 µg/m³, the US EPA's AQI 100 lines, applied hour by hour.

Pick a month to watch the seasons move. Each closed hour is blamed on one thing, in the order cold, hot, rain, muggy, air; the data keeps the main reason per cell, though the page doesn't show it yet.

What stands out: the East African highlands (Nairobi 71%) are far ahead of anywhere else, then the high plateaus and mild coasts (Mexico City, Kunming, the Andes, southern Africa, eastern Australia). The Sahara is mild all autumn but loses its summer to heat and its spring to dust, ending the year at about 18%, just below Kansas City and Dallas. Delhi falls from 23% on weather alone to 1% once smoke and pollution count, and Singapore is too hot or muggy every hour of the year.

## Data

- Weather: ECMWF's ERA5-Land reanalysis from the Copernicus Climate Data Store: hourly, 0.1° (about 9 km), land only. 2 m temperature, 2 m dew point and precipitation, which is accumulated since 00 UTC and differenced to hourly.
- Dust and smoke: CAMS global atmospheric composition forecasts from the Atmosphere Data Store, 0.4°, hourly from each day's 00 UTC run. Each land cell takes its nearest CAMS cell.
- The map is resampled from latitude and longitude onto an Equal Earth grid 3600 cells wide (about 11 km), so columns have square footprints and equal areas. Antarctica is left off. The page draws 3×3 cells per column by default.
- One year's weather, not a climate average.

## Building

Python in `build/.venv` (`cdsapi eccodes numpy pillow`), with a Copernicus key in `~/.cdsapirc` and the ERA5-Land and CAMS licences accepted.

```
cd windowsOpen/build
.venv/bin/python fetch.py --start 2025-11-01 --end 2026-10-31   # weather, about 4 hours
.venv/bin/python air.py --start 2025-11-01 --end 2026-10-31     # dust and smoke, about 3-5 hours, can run alongside
.venv/bin/python export.py                                      # about 30 s
```

`fetch.py` downloads ERA5-Land in 48 chunks of about eight days (3.4 GB of GRIB each), three at a time, reduces each to hour counts per cell plus a packed per-hour bit of whether the weather allowed open windows, and deletes the GRIB. `air.py` does the same for CAMS a month at a time, keeping a bit per hour per CAMS cell where the air was bad. Both skip what's already done, so an interrupted run resumes. `export.py` combines them, so changing the air limits needs only an export, not new downloads, and writes `data/`: one PNG per period (red is the percent of open hours, green the main reason the rest were closed, 255 off land) and `meta.json`.

The renderer is the Comfort Spikes [path tracer](../comfort/map/spikes/pathtracer.js).
