World Columns - 2026 - The world as a path-traced field of columns: city lights glowing under the moon, open-window weather, elevation, population, travel time and rain.

The world's land in columns on an Equal Earth map, each as tall as one number for that place, path traced with soft shadows and light bouncing between them. The tabs at the top right (or keys 1–6) pick the map:

- **Night lights** (the default): how much light each place sent up on cloud-free nights in 2023, measured by satellite, with height on a log scale (a city centre can be 1,000 times a village). Zoomed out, each column is the root mean square of the cells it covers, so a lone city isn't averaged away by its dark neighbours. The page goes dark, and the columns glow by their own brightness and light the pale land around them, under a faint moon whose broad glint shows on the dark, glossy sea.
- **Open windows**: the share of all hours, day and night, from Nov 1, 2025 to Oct 31, 2026, when the windows could have been open. Pick a month in Settings to watch the seasons move.
- **Elevation**: the highest ground in each column, exaggerated about 70 times.
- **Population**: people per square mile in 2025.
- **Travel time** to the nearest city of 50,000 people.
- **Rain** over the same year as the open-window map.

Drag to turn, scroll to zoom toward the pointer, WASD or the arrow keys to slide across, and double-click to glide in; Reset view or Escape goes back. Away from the home view only the legend stays on screen. Point at any column to see its value and the nearest city of 100,000 people (from [GeoNames](https://www.geonames.org/), CC BY 4.0, via `build/cities.py`). Once the camera settles, the URL keeps the view (`view=`), so a link reopens exactly what you see. `?glide` circles low over Europe at night with nothing else on screen, which is what the homepage's hover clip records. `?map=windows`, `elevation`, `population`, `travel` or `rain` opens another map, and `?noPause` keeps rendering while the window isn't focused (it pauses otherwise, to spare the GPU). The project was called Windows Open until it grew more maps; old links redirect.

## Open windows

An hour counts when:

- the air was 62–80°F, or 55–80°F at night (10 pm to 7 am local solar time), when cool air is good for sleeping and the house's own heat keeps the inside warmer,
- the dew point was under 63°F (not muggy),
- less than 1 mm of rain fell,
- the wind averaged under 10 m/s (22 mph) for the hour, and
- there was no dust or smoke: CAMS PM10 under 154 µg/m³ and PM2.5 under 35.4 µg/m³, the US EPA's AQI 100 lines, applied hour by hour.

Each closed hour is blamed on one thing, in the order cold, hot, rain, wind, muggy, air; the data keeps the main reason per cell, though the page doesn't show it yet.

What stands out: the East African highlands (Nairobi 92%) are far ahead of anywhere else, then the high plateaus and mild coasts (Kunming, Sydney, Los Angeles, Cape Town, Johannesburg, Mexico City). The Sahara is mild all autumn but loses its summer to heat and its spring to dust, ending the year at about 21%, just below Kansas City and Dallas. Delhi falls to 1% once smoke and pollution count, and Singapore is too hot or muggy every hour of the year. The cooler night floor helps dry places with cold nights most (San Francisco 27% → 42%). Wind rarely decides anything: it closes over 10% of hours only on a few windy coasts and ridges, like the Canary Islands and the Western Sahara coast.

Why Nairobi beats San Francisco: every hour counts, night included. Nairobi, at 1,700 m on the equator, has days around 77°F and nights that seldom fall below 55°F, so it's open 85–99% of the hours in every month. San Francisco's cool days and nights leave 57% of its hours too cold, from 3% open in its worst month to 83% in its best.

## Rendering

The renderer is the Comfort spike map's [path tracer](../comfort/map/spikes/pathtracer.js): every column fills its grid cell, so a ray walks the grid cell by cell and hits the boxes exactly. Each sample is a jittered camera ray and up to three diffuse bounces, with the sun (or moon) sampled directly from a disk of a few degrees, so shadows have soft edges.

- **Detail where you look.** The page always gives the tracer the same number of columns (650,000 by default) and spends them on what's in view: 33 km columns for the whole world, down to 5.5 km zoomed in, rebuilt once the camera settles.
- **Moving.** While the camera moves it traces a quick preview (30% of the pixels, one bounce), which caps glow found by chance bounces so a few samples don't sparkle). Full-quality samples are drawn a band of rows at a time, sized to about 20 ms of GPU work, so a Retina-sized frame (about half a second whole) never holds up the camera.
- **Denoising**, after SVGF (as in [anotherRaytracer](../anotherRaytracer/)): when the view changes, the last image is moved to where its surfaces are now and counts as up to 8 samples, and five edge-avoiding wavelet passes average each pixel with neighbours on the same face, plane and color whose brightness differs by no more than the noise explains. Against a 4,096-sample render it halves the error at 1 sample (19.8 to 10.1, on a 0–255 scale) and cuts it by a fifth at 4. Each pixel fades back to its own samples as their noise drops (fully under 8% relative error, fully denoised over 25%), since past that the filter would only blur detail where several columns share a pixel; on the elevation map that's never worse than the raw samples from 16 on. **denoise** in Settings › Quality turns it off.
- **Glowing columns are lights** the tracer aims at, like the sun: at every surface it picks one, the brighter and nearer the likelier, by walking down a pyramid of their summed power, and weighs those rays against bounce rays that happen to hit one (multiple importance sampling). Against bounce rays alone it gives the same brightness with about half the noise.
- **Bloom** (night only): light past a threshold spreads into a soft halo, as in a lens, by halving the bright part down a chain of images and adding it back up, each level blurred wider.
- **Water** (night only) mirrors a Fresnel share of the light, blurred, and the moon's glint comes from a GGX lobe on the ray already aimed at the moon.
- **Sampling.** A sample's first choices (where in the pixel, where on the sun's disk, which way to bounce) follow an Owen-scrambled Sobol sequence, so they spread evenly as samples add up.

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
- Night lights: NASA's [Black Marble VNP46A4](https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A4/) for 2023, the annual snow-free composite of calibrated radiance (nW/cm²·sr) at 15″ (about 500 m), averaged into each cell. Las Vegas reads 134, Seoul and New York 98, Paris 68, Lagos 18, Pyongyang 13.
- Travel time: layer 11 of [Nelson 2019](https://figshare.com/articles/dataset/Travel_time_to_cities_and_ports_in_the_year_2015/7638134), 30″: minutes to the nearest city of at least 50,000 people in 2015, on the friction surface of Weiss et al. 2018 (Nature).
- Rain: ERA5-Land monthly means for Nov 2025 to Oct 2026, 0.1°, on the open-window map's own grid.

## Building

Python in `build/.venv` (`cdsapi eccodes numpy pillow tifffile imagecodecs h5py`), with a Copernicus key in `~/.cdsapirc` and the ERA5-Land and CAMS licences accepted.

```
cd worldColumns/build
.venv/bin/python fetch.py --start 2025-11-01 --end 2026-10-31   # weather, about 6 hours
.venv/bin/python air.py --start 2025-11-01 --end 2026-10-31     # dust and smoke, about 3-5 hours, can run alongside
.venv/bin/python export.py                                      # about 30 s
.venv/bin/python lights.py                                      # night lights, about 30 min, needs an Earthdata token
.venv/bin/python layers.py                                      # the other maps, about 7 min
.venv/bin/python cities.py                                      # names for the hover readout, from GeoNames
```

`fetch.py` downloads ERA5-Land in 48 chunks of about eight days (about 5.6 GB of GRIB each), three at a time, reduces each to hour counts per cell plus a packed per-hour bit of whether the weather allowed open windows, and deletes the GRIB. `air.py` does the same for CAMS a month at a time, keeping a bit per hour per CAMS cell where the air was bad. Both skip what's already done, so an interrupted run resumes. `export.py` combines them, so changing the air limits needs only an export, not new downloads, and writes `data/`: one PNG per period (red is the percent of open hours, green the main reason the rest were closed, 255 off land) and `meta.json`. `layers.py` writes one PNG per other map as 16-bit values (high byte in red, low in green, 65535 off land), with `layers.json` giving each one's grid and units. `lights.py` downloads the 540 VNP46A4 tiles from LAADS DAAC four at a time (53 GB in all, each deleted once reduced), using an Earthdata token in `~/.earthdata_token` (Generate Token on your Earthdata profile, after logging in to LAADS once to approve it). The rest of `layers.py`'s sources go in `build/cache/sources/` first: the files linked above (the population zip unzipped), plus the ERA5-Land monthly precipitation, which is a small Climate Data Store request. `layers.py name ...` rebuilds just those maps.
