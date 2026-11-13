Windows Open - 2026 - How much of the year you could have left the windows open, everywhere on Earth, from hourly weather and air quality.

A path-traced map of the world's land in columns, each as tall as the share of all hours, day and night, from Nov 1, 2025 to Oct 31, 2026, when the windows could have been open. An hour counts when:

- the air was 62–80°F, or 55–80°F at night (10 pm to 7 am local solar time), when cool air is good for sleeping and the house's own heat keeps the inside warmer,
- the dew point was under 63°F (not muggy),
- less than 1 mm of rain fell,
- the wind averaged under 10 m/s (22 mph) for the hour, and
- there was no dust or smoke: CAMS PM10 under 154 µg/m³ and PM2.5 under 35.4 µg/m³, the US EPA's AQI 100 lines, applied hour by hour.

Pick a month to watch the seasons move. There are five other maps on the same projection: **Elevation** (the highest ground in each column, exaggerated about 70 times), **Population** (people per square mile in 2025), **Night lights** (at night: the page goes dark, a faint moon lights the land, and the columns glow by their own brightness, lighting the ground and each other), **Travel time** to the nearest city of 50,000 people, and **Rain** over the same year as the open-window map. The tabs at the top right (or keys 1–6) pick the map. Drag to turn, scroll to zoom toward the pointer, WASD or the arrow keys to slide across, and double-click to glide in; Reset view or Escape goes back. While the camera moves the page traces a quick preview (30% of the pixels, one bounce), and once it settles it goes back to full quality, with columns sharpened to the new view. Full-quality samples are drawn a band of rows at a time, sized to about 20 ms of GPU work, so a Retina-sized frame (which takes about half a second whole) never holds up the camera. A denoiser after SVGF (as in [anotherRaytracer](../anotherRaytracer/)) cleans up what's shown while samples are few: when the view changes it moves the last image to where its surfaces are now and counts it as up to 8 samples, and five edge-avoiding wavelet passes average each pixel with neighbours on the same face, plane and color whose brightness differs by no more than the noise explains. Against a 4,096-sample render it halves the error at 1 sample (19.8 to 10.1, on a 0-255 scale) and cuts it by a fifth at 4; it fades out between 16 and 64 samples, where several columns share a pixel and it would only blur real detail. **denoise** in Settings > Quality turns it off. A sample's first choices (where in the pixel, where on the sun's disk, which way to bounce) follow an Owen-scrambled Sobol sequence, so they spread evenly as samples add up: the page always gives the path tracer the same number of columns (650,000 by default) and spends them on what's in view. Away from the home view only the title and legend stay on screen. Rendering pauses while the window isn't focused, to spare the GPU; add `?noPause` to the URL to keep it going (for screenshots), and `?map=elevation`, `population`, `lights`, `travel` or `rain` to open another map.

 Each closed hour is blamed on one thing, in the order cold, hot, rain, wind, muggy, air; the data keeps the main reason per cell, though the page doesn't show it yet.

What stands out: the East African highlands (Nairobi 92%) are far ahead of anywhere else, then the high plateaus and mild coasts (Kunming, Sydney, Los Angeles, Cape Town, Johannesburg, Mexico City). The Sahara is mild all autumn but loses its summer to heat and its spring to dust, ending the year at about 21%, just below Kansas City and Dallas. Delhi falls to 1% once smoke and pollution count, and Singapore is too hot or muggy every hour of the year. The cooler night floor helps dry places with cold nights most (San Francisco 27% → 42%). Wind rarely decides anything: it closes over 10% of hours only on a few windy coasts and ridges, like the Canary Islands and the Western Sahara coast.

Why Nairobi beats San Francisco: every hour counts, night included. Nairobi, at 1,700 m on the equator, has days around 77°F and nights that seldom fall below 55°F, so it's open 85–99% of the hours in every month. San Francisco's cool days and nights leave 57% of its hours too cold, from 3% open in its worst month to 83% in its best.

## Checks

These were run under the original test, 62°F around the clock and no wind limit, which the newer one only loosens at night.

- The page's labels match the build cache read directly at each city's own ERA5-Land cell (Nairobi 70% on weather alone, San Francisco 27%), and Open-Meteo's independent ERA5-Land series for the same year and places agrees within 1–3 points (Nairobi 73%, SF 27%, London 24%, Lisbon 36%, Mexico City 41%, Sydney 43%, Kunming 40%, Dubai 25%).
- Against NOAA ISD station observations for 2024 (temperature and dew point only, the hours each station reported), ERA5-Land is close and, if anything, low for Nairobi: Wilson 81% observed vs 73% ERA5-Land, JKIA 68% vs 70%, SFO 24% vs 24%, Oakland 32% vs 29%, Heathrow 21% vs 17%, Sydney Observatory Hill 35% vs 37%. Mean temperature bias was within ±0.7°C at all of them.

## Data

- Weather: ECMWF's ERA5-Land reanalysis from the Copernicus Climate Data Store: hourly, 0.1° (about 9 km), land only. 2 m temperature, 2 m dew point, 10 m wind and precipitation, which is accumulated since 00 UTC and differenced to hourly.
- Dust and smoke: CAMS global atmospheric composition forecasts from the Atmosphere Data Store, 0.4°, hourly from each day's 00 UTC run. Each land cell takes its nearest CAMS cell.
- The map is resampled from latitude and longitude onto an Equal Earth grid 3600 cells wide (about 11 km), so columns have square footprints and equal areas. Antarctica is left off. At the home view each column averages 3×3 cells.
- One year's weather, not a climate average.
- The other maps don't depend on the weather, so all but rain are binned straight from their sources onto a grid twice as fine (7200 cells, about 5.5 km). Their coastline comes from ETOPO, with ERA5-Land deciding big lakes (water) and inland land below sea level (land).
- Elevation: [ETOPO 2022](https://www.ncei.noaa.gov/products/etopo-global-relief-model) from NOAA, 60″, the highest point in each cell, so ranges keep their peaks.
- Population: [GHS-POP R2023A](https://ghsl.jrc.ec.europa.eu/download.php?ds=pop) from the EU Joint Research Centre, the 2025 estimate on a 30″ (about 1 km) grid, people in each cell over its area.
- Night lights: NASA's [Black Marble 2016](https://visibleearth.nasa.gov/images/144897/earth-at-night-black-marble-2016-grayscale-maps) grayscale picture, 3 km. It's an image, not calibrated radiance, so city centres saturate; the page has no city labels for it.
- Travel time: layer 11 of [Nelson 2019](https://figshare.com/articles/dataset/Travel_time_to_cities_and_ports_in_the_year_2015/7638134), 30″: minutes to the nearest city of at least 50,000 people in 2015, on the friction surface of Weiss et al. 2018 (Nature).
- Rain: ERA5-Land monthly means for Nov 2025 to Oct 2026, 0.1°, on the open-window map's own grid.

## Building

Python in `build/.venv` (`cdsapi eccodes numpy pillow tifffile imagecodecs h5py`), with a Copernicus key in `~/.cdsapirc` and the ERA5-Land and CAMS licences accepted.

```
cd windowsOpen/build
.venv/bin/python fetch.py --start 2025-11-01 --end 2026-10-31   # weather, about 6 hours
.venv/bin/python air.py --start 2025-11-01 --end 2026-10-31     # dust and smoke, about 3-5 hours, can run alongside
.venv/bin/python export.py                                      # about 30 s
.venv/bin/python layers.py                                      # the other maps, about 7 min
```

`fetch.py` downloads ERA5-Land in 48 chunks of about eight days (about 5.6 GB of GRIB each), three at a time, reduces each to hour counts per cell plus a packed per-hour bit of whether the weather allowed open windows, and deletes the GRIB. `air.py` does the same for CAMS a month at a time, keeping a bit per hour per CAMS cell where the air was bad. Both skip what's already done, so an interrupted run resumes. `export.py` combines them, so changing the air limits needs only an export, not new downloads, and writes `data/`: one PNG per period (red is the percent of open hours, green the main reason the rest were closed, 255 off land) and `meta.json`. `layers.py` writes one PNG per other map as 16-bit values (high byte in red, low in green, 65535 off land), with `layers.json` giving each one's grid and units. Its sources go in `build/cache/sources/` first: the files linked above (the population zip unzipped), plus the ERA5-Land monthly precipitation, which is a small Climate Data Store request. `layers.py name ...` rebuilds just those maps.

The renderer is the Comfort Spikes [path tracer](../comfort/map/spikes/pathtracer.js).
