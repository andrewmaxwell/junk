Weather Station - 2026 - Always-on living room display of the time, outdoor weather, forecast and indoor air.

The display page for the living room tablet. Open `index.html?demo` for made-up indoor readings; without it, indoor numbers wait for the Android app ([weather-station-android](https://github.com/andrewmaxwell/weather-station-android)) to call `window.onAranet`. Location defaults to 38.8, -90.4 (rounded on purpose); override with `?lat=..&lon=..`.

- `main.js`: loads the weather (comfort's `fetchWeatherBundle`) and indoor readings, renders everything.
- `indoor.js`: indoor feels-like (SET, ASHRAE 55), clothing by season, dew point.
- `charts.js`: the 24-hour and 10-day lines.
- `advice.js`: the two action lines (alerts, windows, walk, outlook).

Tests: `node --test weatherStation/test/*.test.js` (SET is checked against pythermalcomfort).

The rest of this file is the planning notes.

## Design

Beautiful, legible, functional. It answers five questions at a glance:

1. What time is it?
2. How does it feel outside?
3. Should the windows be open, and should the AC or furnace be on?
4. Is now a good time for a walk, and if not, when?
5. What's coming in the next few days: when does rain or snow start or stop, and when does it warm up or cool off noticeably?

### Principles

- **Answer in words, back them with numbers.** "Open the windows until 10pm" beats three numbers you have to compare. The numbers sit underneath for anyone who wants them.
- **Three reading distances.** From the couch: time, the two temperatures, and the two verdicts. From a few steps away: the forecast headline and its chart. Up close: dew points, CO2, thermostat details.
- **Color means something or it isn't there.** One temperature scale (cold blue, comfortable green, hot amber/red), used everywhere a temperature appears. Verdicts get a color for good, meh and bad. Everything else is neutral.
- **Dark and calm.** It's on all day in a living room. Near-black background, no animation except slow changes, and a dimmer night mode (see below).
- **Quiet when nothing's wrong.** Alerts, smoke and freeze warnings only take up space when they apply.

### Layout (landscape, 16:10)

```
┌──────────────────────────────────────┬───────────────────────┐
│ ☀ OUTSIDE                            │ ┌───────────────────┐ │
│  72° ↗  Mainly clear, light breeze   │ │ ⌂ INSIDE          │ │
│         Comfortable · dew 57° · 76°  │ │  71°              │ │
│                                      │ │ Comfortable · dew │ │
│ NEXT 24 HOURS                        │ │ CO₂ 1150 ↗ · heat │ │
│  ╱‾‾high 79° 3pm‾‾╲___low 51° 5am__╱ │ └───────────────────┘ │
│  now  3p  6p  9p  12a  3a  6a  9a    │ ● Open windows at 9pm │
│                                      │ ● Good walk now · 73  │
│ NEXT 10 DAYS                         │                       │
│  Today Fri Sat Sun Mon Tue Wed …     │                 11:56 │
│   79   77  68  60  57  66  64        │  Thu, Oct 29 · ☼ 6:04 │
│   52   51  54  54  50  48  52        │                       │
└──────────────────────────────────────┴───────────────────────┘
```

Why everything is where it is:

- **One column per place.** Left is everything about outside, right is everything about the house. Where a number sits tells you which it is before you read a label.
- **Inside and outside line up at the top.** Same label height, same number height, side by side: the two numbers you compare most sit level, each under its own name.
- **Outside reads top to bottom as now → today → this week.** Moving down the column moves further into the future, and each step is shown in less detail. It gets ~60% of the width because it holds the most information, and the 24-hour chart needs width for its hour labels.
- **Inside is treated differently, not just labelled differently.** It sits in a lit "room" panel with a house icon, while outside is open. Its number is white, while outside's is colored by temperature: indoor is nearly always comfortable, so color would only be noise there, and color stays the signal for weather.
- **Actions sit right under the house**, because most are about it: what's true inside, then what to do about it. "Is there anything I should do?" has one place to look.
- **The clock goes bottom right.** It belongs to neither place, and a corner is where a clock is easy to find without competing with the temperatures.
- **Actions have room for exactly two one-line items**, so they're ranked: safety (NWS alerts, freezing rain, hazardous air) > windows/HVAC > walk > outlook ("Colder Saturday"). The outlook only appears when nothing more urgent needs the space. Headlines must fit on one line (checked in a browser at the tablet's shape).
- **Trend arrows** next to the outside number and CO2 say which way they're heading. Where the outside temperature is going is the 24-hour chart's job, so there's no separate line for it.
- **Every big number is feels-like; raw temperatures always say "air".** The charts have no captions: their shape says what they are, and the 10 days carry day names and dates (10/29).
- **10 days.** Days 6–10 are drawn fainter, since the forecast is less certain that far out. Rain chances under 30% are left off both charts.
- **The 24-hour chart** labels its high and low with times, shades the sky by sunlight as one smooth wash, and shows rain or snow as bars (height = chance) with a time-range label. The 10 days are one continuous line (3-hour averages) across ten day columns, with each day's high over its low below the line ("80/52°" side by side was too wide for a column), and rain or snow as bars by time of day. It replaced low–high bars (2026-10-29): the line shows when within a day a front arrives or rain starts and stops, which the bars couldn't.

### Each question

**Time.** Big, top left, with the date small underneath. No seconds.

**Outside.** The hero number is comfort's shaded UTCI "feels like", colored on the temperature scale. Under it, smaller: actual temperature, dew point, and a short description ("Cloudy, breezy"). Maybe one comparison line from comfort's `comfortDelta` / `climatologyPhrase`, like "8° cooler than yesterday".

**Windows and HVAC.** One verdict, from indoor (Aranet4, Sensi), outdoor now, and the next few hours of forecast:

| Verdict | When |
|---|---|
| Open the windows (until 10pm) | Outside is closer to comfortable than inside, outdoor dew point is acceptable, air quality is fine, no rain in the next hour or two. "Until" is when the forecast leaves that band. |
| Close the windows (by 6pm) | The open-window conditions are about to end: getting cold, muggy, rain coming. |
| Air the room out | CO2 high (say 1200+), even when it's AC or furnace weather. Ten minutes is enough. |
| AC running, but it's 64° out | Sensi says it's cooling while outside would do the job for free. Same for heating on a warm afternoon. |
| Nothing to do | Hidden, or a quiet "Windows closed, all good". |

- Preferences (in `advice.js`): ideally about 75° and 50% humidity (dew point ~55°), with fresh air whenever it's free. The thermostat holds 68° in winter and 80° in summer to save money, so outside air is "free" between those: letting it in won't make the furnace or AC run. Open windows are suggested when the air is free, not muggy (dew ≤ 60°), not smoky, not about to rain, would last at least 2 hours, and leaves the house about as close to 75° as it is now (within 2°) or CO₂ is high. The Sensi's real setpoints replace 68/80 once connected.
- Needs hysteresis so it doesn't flip back and forth when temperatures hover at a threshold.
- Later: guess whether the windows are actually open, from CO2 dropping quickly and indoor temperature heading toward outdoor.

**Walk.** comfort's score and verdict for now. If now isn't good, `findBestWindow` for the rest of today, or tomorrow if today is done: "Best walk: tomorrow 10–11am".

**Next few days.** Two lines of plain sentences on top of a chart:

- **Sentences** are generated from events in the forecast, at most two, the most important first:
  - rain or snow starting and stopping ("Rain 3am to noon tomorrow")
  - a noticeable warm-up or cool-off: the daily high or low moving 10°F+ from today, or well away from normal using comfort's climatology ("Turning colder Friday, highs in the 40s")
  - first freeze, heat, strong wind, NWS alerts
- **Chart:** hourly feels-like for 5 days as a temperature-colored line, precipitation as bars (rain and snow styled differently), night shaded, day names along the bottom. Up close it shows the shape. From the couch the sentences carry it.

### What comes from comfort

Imported straight from `../comfort/js/`, so there's one tested copy:

- `thermal.js`: `feltTemperature` (UTCI) for the outside hero, the 24-hour line and the daily lows and highs, all shaded. `thermalStress` puts UTCI's own words ("moderate heat stress") under the outside number when it isn't neutral.
- `weather.js`: `fetchWeatherBundle` (Open-Meteo plus air quality, with the time zone handling already solved), `describeWeatherCode`, `weatherIcon`.
- `comfort.js`:
  - `comfortScore` / `comfortVerdict` and `findBestWindow` for the walk action, and `comfortReason` for its subtitle, which includes a clothing suggestion ("light jacket").
  - `describeHumidity` turns both dew points into words (Dry, Comfortable, Muggy, Oppressive), which read from the couch where "dew 52°" doesn't.
  - `describeAirQuality` and the hazard checks (storm, freezing rain, gale, hazardous air) feed the actions area and the window verdict.
  - `rainOutlook` for rain phrasing.
- `chart.js`'s idea of shading the sky by actual sunlight (shortwave radiation) rather than a flat night band, so an overcast afternoon reads darker than a sunny one.
- `sw.js` as the model for the offline cache.
- Sunrise/sunset ("sunset 6:05") as a small line under the clock: it's when the walk window usually closes.

Later, maybe: the ensemble spread as a faint widening around later days' bars (honest uncertainty), and climatology for "warmest late-October afternoon in years" style forecast sentences.

Skipped: the activity toggle, place search and geolocation. The location is fixed, but rounded to ~0.1° in the code, since junk is public and home coordinates shouldn't be.

Indoor "feels like" (SET) is new, not in comfort.

### Night

The Android app reads the tablet's light sensor and sets the screen brightness itself, or leaves it to Android when Adaptive brightness is on (see weather-station-android's README), then calls `window.onLight(lux)`. Below 8 lux the page switches to a night look: warmer, softer whites and quieter colors, with the layout unchanged. It switches back above 20 lux, so a lamp at the threshold doesn't flicker it. `?lux=3` pretends the room is dark, for working on it.

### Freshness

Each source (Open-Meteo, Aranet4, Sensi) has a last-updated time. When one goes stale, its numbers fade and show their age, rather than looking current when they aren't.

### Touch, later

Not needed for v1. Natural first taps: forecast → 10-day and hourly detail, inside → 48h CO2 and temperature history, walk → comfort's "why this score".

### Sensi thermostat

Worth doing: it adds a second indoor temperature, the setpoints (the comfort band above), the mode, and whether the furnace or AC is running right now. That last one is what makes "AC running but it's 64° out" possible.

- No official API. Community integrations (Home Assistant's [iprak/sensi](https://github.com/iprak/sensi), [homebridge-sensi](https://www.pkgstats.com/pkg:homebridge-sensi)) use the Sensi app's own API, which is OAuth for login plus a WebSocket for live state.
- Login now has a reCAPTCHA, so the refresh token is copied by hand once from the browser's dev tools after signing in at manager.sensicomfort.com. Redo it after a password change.
- The browser can't call it directly (CORS), so the Android app does it, the same way it does the Aranet4, and passes state in with something like `window.onSensi(...)`. For development on the Mac, a small local Node script does the same.
- **The refresh token never goes in either repo.** junk is public. It lives on the tablet only.
- Read-only to start. Changing setpoints from the display is possible later, but that's a bigger trust step.
- Unofficial, so it can break when Sensi changes their app. The display should carry on without it.

## Hardware

### Start with the Aranet4 we already have

The Aranet4 measures CO2, temperature, humidity and pressure, and it only talks Bluetooth LE. With firmware v1.2.0+ and **Smart Home integrations** turned on in the Aranet Home app, it broadcasts its current readings in its Bluetooth advertisements, so nothing has to pair with it.

**Decided:** the tablet listens for the Aranet4 itself, in a small Android app: [andrewmaxwell/weather-station-android](https://github.com/andrewmaxwell/weather-station-android) (private). It shows this page full-screen and calls `window.onAranet(reading)` / `window.onAranetHistory(readings)`, and offers `window.Android.setBrightness()`. That repo's README has the details. No extra hardware needed; the ESP32 and SEN66 notes below are kept as alternatives.

- Parsing references: [Anrijs/Aranet4-ESP32](https://github.com/Anrijs/Aranet4-ESP32) (`secure=false` reads current values without pairing), aranet4-python, and the aranet-core Rust crate's passive (advertisement) mode. Temperature comes as raw/20, pressure as raw/10.
- Ours is on firmware v2.07, with Smart Home integrations on and a 1 minute interval.
- To check it's broadcasting from a Mac: `pip install aranet4`, then `aranetctl --scan` in Terminal.app (which will ask for Bluetooth permission).
- History needs pairing, so the board keeps its own rolling history from what it hears.
- Why not Web Bluetooth straight from the tablet? Fully Kiosk runs in Android WebView, which has no Web Bluetooth. Chrome does, but reconnecting after a reload needs a tap or experimental flags. Fragile for an always-on display.

### Alternative: borrowed Lenovo Tab M10 + a separate Wi-Fi sensor

Andrew's dad has a Lenovo Tab M10 to lend. It does everything the Pi + display did (10.1" IPS, Chrome, a built-in light sensor for auto-dimming), for free. The air sensor becomes its own little Wi-Fi box:

| Part | Where | Price |
|---|---|---|
| Sensirion SEN66-SIN-T | DigiKey (~$59) or Mouser (~$71) | ~$59 |
| Adafruit SEN6x breakout #6331 + 6-pin JST GH cable #5754 | Adafruit | $4.50 + $0.95 |
| Adafruit QT Py ESP32-S3 #5426 (Wi-Fi, STEMMA QT port, plugs straight into the breakout) + STEMMA QT cable #4210 | Adafruit | $12.50 + $0.95 |
| USB-C cable + any 5V phone charger for the QT Py | have one | – |

About $80, instead of ~$260 for the Pi build.

```
[SEN66] -> breakout -> QT Py ESP32-S3, somewhere in the room away from the tablet
             serves http://<ip>/       a stub page that imports main.js from GitHub Pages
                    http://<ip>/air    {co2, tempC, rh, pm25, voc, nox} + recent history

Tablet: Fully Kiosk Browser -> http://<ip>/
```

The QT Py serves the page itself because Chrome won't let an https page (GitHub Pages) fetch from a plain-http device on the LAN. Served from the QT Py, the sensor fetch is same-origin. Loading the app's JS from GitHub Pages works because Pages sends `Access-Control-Allow-Origin: *`, so the firmware stays tiny and the app updates with a push.

Self-heating stops being a problem, because the sensor no longer sits next to a computer and a backlight. Keep it away from the tablet, sunny windows and the kitchen anyway.

Tablet notes:

- **Battery.** A tablet charging 24/7 can swell. Turn on Settings → Battery → Battery protection, which caps charging at 60% on Lenovo tabs. Some firmware updates reportedly flip that setting on its own, so check it now and then. It's Dad's tablet, so tell him about this risk.
- **Kiosk.** Fully Kiosk Browser: starts on boot, keeps the screen on, hides the browser UI, can schedule the screen off at night, and adjusts brightness. Basic is free and Plus is a few dollars.
- **Which M10?** There are several generations. Settings → About tells you. An Android version older than 10 means current Chrome won't install, which matters for ES modules and modern CSS.

### Original plan: Raspberry Pi

The deciding constraint is reusing `comfort/js` (UTCI, Open-Meteo fetching, chart), which means the display should run a real browser. That rules out ESP32 displays and makes e-ink a poor fit (no backlight at night, slow refresh).

**Recommended: Raspberry Pi + LCD + one Sensirion sensor, all in one box.**

| Part | Why | Approx. |
|---|---|---|
| Raspberry Pi 5 (2GB) or Pi 4 | Runs Chromium in kiosk mode. A Pi Zero 2 W is too slow for Chromium. | $50–60 |
| Display, 7" to 10" | Official Pi Touch Display 2 (7", 720x1280) is tidy; a 10.1" IPS HDMI panel gives bigger numbers. See distance section. | $60–90 |
| **Sensirion SEN66** | One I2C module: CO2 (true NDIR, not estimated), PM1/2.5/4/10, temperature, humidity, VOC index, NOx index. | ~$70 |
| Light sensor (VEML7700) | Optional, for auto-dimming. | ~$5 |

Cheaper split if one SEN66 feels like overkill: SCD41 (CO2, temp, RH) alone is ~$30–50.

### Parts list (prices checked 2026-10-29)

| Part | Where | Price |
|---|---|---|
| Raspberry Pi 5, 2GB | Authorized reseller (PiShop.us, Micro Center, CanaKit). Amazon resellers mark it up a lot: the 4GB was $127 there. | $77.50 list |
| Raspberry Pi 27W USB-C power supply | Same reseller | ~$12 |
| Raspberry Pi Active Cooler | Same reseller | ~$5 |
| microSD 32GB, endurance-rated (e.g. Samsung PRO Endurance) | Amazon | ~$12 |
| Waveshare 10.1" DSI capacitive touch, 800x1280 IPS (ASIN B0DSSNJNSR). DSI, software backlight control, optically bonded glass, aluminum back. | [Amazon](https://www.amazon.com/dp/B0DSSNJNSR) | $79.99 |
| Sensirion SEN66-SIN-T | DigiKey (~$59) or Mouser (~$71). On Amazon it's $199.99 from a third-party seller. | ~$59 |
| Adafruit SEN6x breakout #6331, + 6-pin JST GH cable #5754 | Adafruit | $4.50 + $0.95 |
| STEMMA QT to female header cable #4397 (breakout to Pi GPIO) | Adafruit | $0.95 |
| Adafruit VEML7700 light sensor #4162 (optional, auto-dim; chains off the breakout) + STEMMA QT cable #4210 | Adafruit | ~$6 |

About $260 total. The Pi got expensive in 2026 (RAM shortage). A Pi 5 1GB ($45) would probably run a single Chromium page, but it's tight.

Why this display over HDMI ones: HDMI panels usually can't be dimmed from software, and dimming at night matters. Why not the official 7" Touch Display 2 ($60): less than 10 ft of readable range.

**Alternative: old tablet + network sensor.** An iPad/Android tablet in kiosk mode plus an AirGradient ONE (has a local HTTP API) or similar. Nicer screen for the money, but a tablet left on charge 24/7 risks a swollen battery, and the browser has to reach the sensor over the LAN (CORS / local network access permissions to check).

### Gotchas

- **Self-heating.** The Pi and the screen backlight will warm a sensor sitting in the same case by several degrees and pull RH down with it. Mount the sensor outside the case or on a short cable with airflow, below and away from the Pi. Then calibrate a temperature offset against a trusted thermometer.
- **CO2 calibration.** SCD4x/SEN66 auto-calibrate assuming they see ~420 ppm (fresh air) at least once a week. A room that's always occupied won't, so either open a window occasionally or do a manual forced recalibration outdoors once.
- **Night.** A bright screen in a dark living room is annoying. Dim the backlight (`/sys/class/backlight`) by sunset/sunrise or a light sensor, and switch to a dark, low-contrast palette at night. LCD, so no burn-in worries, but OLED would have them.

## Software

```
[SEN66] --I2C--> sensor service on the Pi (small Node or Python script)
                   serves GET /air -> {co2, tempC, rh, pm25, voc, nox}
                   keeps ~48h history in memory or SQLite for sparklines

Chromium kiosk  -> http://localhost:<port>/weatherStation/
                   fetches /air every ~10s
                   fetches Open-Meteo every ~10 min (reuse comfort/js/weather.js)
```

- Serving the page from the Pi itself avoids the HTTPS-page-calling-localhost permission issues, and keeps working if the internet drops (indoor stays live, outdoor shows its age).
- Deploying the page to GitHub Pages too is handy for designing it on the Mac with fake sensor data.
- Indoor dew point is computed from temperature and RH (Magnus formula). Dew point is the better indoor humidity number for the same reason it is outdoors: it doesn't swing as the thermostat cycles.
- Outdoor "feels like" should be comfort's UTCI (`feltTemperature`), so the display and the comfort app agree. Decide shade vs sun: shaded is probably the better default for a "what's it like out" number.
- Open-Meteo `minutely_15` gives fresher "current" values in the US than hourly.
- NWS alerts (api.weather.gov/alerts/active?point=lat,lon) are free and worth a banner when there is one.
- Optional, for fun: an RTL-SDR dongle + `rtl_433` can decode the existing La Crosse outdoor sensor, if it's ever worth having a measured outdoor temperature alongside the forecast one.

## Indoor + outdoor together

The unique thing about having both on one screen:

- **Open the windows?** Outdoor is cooler than indoor (when indoor is warm), outdoor dew point is below indoor, and AQI is fine. A simple badge.
- **CO2 trend** says when the room needs air, more usefully than the absolute number: "rising 300 ppm/hour".
- **Winter dryness and condensation.** Indoor dew point too low (dry skin, static) vs. high enough that windows will fog given the outdoor temperature.
- **Smoke days.** Outdoor AQI high while indoor PM2.5 is low means keep the windows shut, and shows the house is keeping it out.
- **Best walk today.** comfort's `findBestWindow` as one line: "Best walk: 3–4pm, 82".

## Reading it from across the room

Rule of thumb for signs: about 1 inch of letter height per 10 ft for comfortable reading. From a couch ~10 ft away the three hero numbers want ~1–1.5" tall digits.

- A 7" screen in landscape is ~3.4" tall, so it fits one row of ~1.3" hero numbers with small text below.
- A 10.1" screen is ~5.3" tall, which allows two rows of big numbers, or bigger ones.
- Use color for status (CO2 green/amber/red, feels like on a temperature scale) so the state reads even when the digits don't.
- Tabular, bold, high-contrast digits. No thin weights.

## Decisions (2026-10-29)

- Couch is ~10 ft away, so hero digits ~1" tall. Three of those just fit across a 10" screen in a semi-condensed face; the time is a step smaller than the temperatures.
- **Both heroes are "feels like."** Raw temperatures go in the small print. Outside is comfort's UTCI. Inside needs an indoor model: SET (Standard Effective Temperature, from ASHRAE 55's comfort model) for someone sitting, in seasonal clothing, in still air. Indoors at 68–74°F humidity only moves it a degree or two; it matters much more once it's warm.
- Inside temperature comes from the Sensi: it's central, fixed and out of the sun. Humidity comes from the Aranet4 as a dew point, which is nearly the same everywhere in the house, so it combines cleanly with the Sensi's temperature. CO2 is Aranet4 only.
- Furnace + central AC.
- Walk verdict assumes walking.
- Night dimming follows the room's light. WebView has no light sensor API, so the Android app reads the tablet's sensor, sets brightness itself, and passes the light level to the page for a dimmer night palette.

## Open questions

- Which M10 (screen resolution, Android version)?
- Enclosure / stand for the tablet.
