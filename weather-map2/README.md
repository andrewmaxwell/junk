# UTCI world map

Renders a global "how it feels outside" map from ERA5-HEAT, the Copernicus
reanalysis of the Universal Thermal Climate Index.

## One-time setup

1. Register at <https://cds.climate.copernicus.eu> and log in.
2. Visit <https://cds.climate.copernicus.eu/how-to-api> and paste the two-line
   block into `~/.cdsapirc`. **Copy it from that page** — the URL changed in the
   2024 CDS migration and a stale `.cdsapirc` is the most common failure.
3. Open the [dataset page](https://cds.climate.copernicus.eu/datasets/derived-utci-historical),
   scroll to the bottom of the **Download** tab, and **accept the licence**.
   Requests 403 until this is done once, manually, in a browser.
4. `pip3 install "cdsapi>=0.7.7" netCDF4 numpy pillow`

## Use

```bash
python3 fetch_utci.py 2026-05-15 --out data/
python3 render_utci.py data/*.nc --mode local --out utci.png
```

Try the render path without waiting on the CDS queue:

```bash
python3 make_test_data.py
python3 render_utci.py fake_day1.nc fake_day2.nc --mode local --out test.png
```

## Timelapse video

One frame per hourly UTC slice, so the day/night terminator sweeps westward
through the frame — 15° of longitude per frame, one rotation per 24 frames.

```bash
python3 fetch_utci.py 2026-05-31 --days 30 --out data/     # ~1.6 GB
python3 render_video.py data/*.nc --out utci_30day.mp4
```

30 days × 24 hours = 720 frames, which at the default 24 fps is a 30-second
clip running one day per second. No legend — the only text is a small UTC
timestamp, and `--no-timestamp` drops that too. Defaults to 2880×1200 H.264;
`--width/--height`, `--fps`, and `--crf` override. `--limit N` renders a short
test instead of the whole run.

Frames are streamed a day at a time straight into ffmpeg (`brew install
ffmpeg`), so peak memory is about one day of data, not the whole month.

**Which 30 days?** `consolidated_dataset` ends well behind real time, and
asking for a day past the end fails the whole request with an unhelpful
"not produced a valid combination of values" — the same error you get for
asking for June 31. `probe_availability.py 2026-05 2026-06` requests each month
at a 1° area (a few kB) and reports which days came back, which is the cheap
way to find the current edge of the record. As of August 2026 it ended at
**2026-05-31**.

## Modes

| mode    | what it answers                                                 |
| ------- | --------------------------------------------------------------- |
| `local` | how it felt there mid-afternoon (**default; the one you want**) |
| `mean`  | overall character of the day                                    |
| `max`   | the worst of the afternoon                                      |
| `hour`  | a single UTC instant — shows the day/night terminator           |

`local` samples a different UTC hour per column so every pixel reports the same
_local_ clock time. This is why `fetch_utci.py` grabs two days by default:
15:00 local at UTC−12 is 03:00 UTC on the following day.

## Dataset facts worth remembering

- Values are **Kelvin**; the renderer converts.
- Coverage is **90N–60S — no Antarctica**. Grid is 1440 × 601 at 0.25°.
- `consolidated_dataset` lags 2–3 months. For recent dates pass
  `--product intermediate_dataset`, which updates daily but is provisional.
- The response is a **ZIP of one NetCDF per day**.
- Requests are queued; a two-day global request takes a few minutes.

## Colour ramp

Keyed to the ten official UTCI stress categories, with **equal colour per band
rather than per degree** — the bands are very uneven (no-thermal-stress spans
9–26 °C, its neighbours span 6 °C), so a ramp linear in degrees would paint most
of the inhabited world one shade and waste half the gradient on the Arctic.

Lightness peaks in the comfortable middle, so the map still reads as
"distance from comfortable" in greyscale or to a red-green colourblind viewer.
Deep violet, not black, marks extreme cold — black is what no-data looks like.

Edit `BAND_COLORS` in `colormap.py` to taste; the anchors are band edges.
