-- Builds health.duckdb from the files in data/. Run by build.js, which splits
-- statements on lines containing only "--".
--
-- Every timestamp is local wall clock time as a plain TIMESTAMP, so times
-- line up across sources: America/Chicago at home, the local zone on trips.
--
-- The day rule: a night belongs to the day you wake up on. night_day() maps
-- any timestamp to that day by shifting it 12 hours forward, so 10pm Monday
-- through 11:59am Tuesday all count toward Tuesday. Journal entries are
-- written in the evening and describe that day; ones written after midnight
-- count toward the day before.

CREATE MACRO night_day(ts) AS (ts + INTERVAL 12 HOUR)::DATE;
--
CREATE MACRO journal_day(ts) AS (ts - INTERVAL 4 HOUR)::DATE;
--
-- Google Health times are UTC plus a separate offset like "-18000s".
-- read_json may parse the time as a UTC TIMESTAMP or leave it a string ending
-- in Z, so normalize through VARCHAR.
CREATE MACRO google_local(t, utc_offset) AS
  replace(t::VARCHAR, 'Z', '')::TIMESTAMP
  + to_seconds(replace(utc_offset, 's', '')::INT);
--
CREATE MACRO civil_date(d) AS make_date(d.year, d.month, d.day);
--

-- Trips outside the home time zone. The CPAP and Aranet record home time
-- (America/Chicago) wherever they are, so their times get converted to the
-- trip's local time on these dates.
CREATE TABLE trips AS
SELECT start::DATE AS start, "end"::DATE AS "end", timezone, place
FROM read_csv('trips.tsv', delim = '\t', header = true, all_varchar = true);
--
CREATE MACRO trip_local(ts) AS coalesce(
  (SELECT (ts AT TIME ZONE 'America/Chicago') AT TIME ZONE t.timezone
   FROM trips t WHERE ts::DATE BETWEEN t.start AND t."end"),
  ts);
--

-- Journal (Google Form): 0-5 ratings and free text. A few rows have a date
-- with no time; the last entry on a day wins.
CREATE TABLE journal AS
SELECT
  journal_day(ts) AS day,
  ts,
  "Energy Level"::INT AS energy,
  "Anxiety Level"::INT AS anxiety,
  "Headache"::INT AS headache,
  "Mood"::INT AS mood,
  try_cast("Exercise" AS INT) AS exercise,
  nullif(trim("Notes"), '') AS notes
FROM (
  SELECT *, coalesce(
      try_strptime("Timestamp", '%m/%d/%Y %H:%M:%S'),
      strptime("Timestamp", '%m/%d/%Y') + INTERVAL 20 HOUR
    ) AS ts
  FROM read_csv('Energy Tracker (Responses) - Form Responses 1.csv', all_varchar = true)
)
QUALIFY row_number() OVER (PARTITION BY journal_day(ts) ORDER BY ts DESC) = 1;
--

-- Aranet4 in the bedroom, one reading per minute.
CREATE TABLE air AS
SELECT
  trip_local(strptime(column0, '%m/%d/%Y %I:%M:%S %p')) AS ts,
  column1::INT AS co2_ppm,
  round((column2::DOUBLE - 32) * 5 / 9, 2) AS temp_c,
  column3::INT AS humidity_pct,
  column4::DOUBLE AS pressure_hpa
FROM read_csv('Aranet4*.csv', header = true, all_varchar = true,
  names = ['column0', 'column1', 'column2', 'column3', 'column4']);
--

-- Open-Meteo hourly weather and air quality, fetched in UTC: for home, and
-- for where Andrew was on days he spent 50+ km away (place is "lat,lon"). Away
-- days use only the away rows, in that place's local time.
CREATE MACRO utc_to_local(t) AS (t || ':00+00')::TIMESTAMPTZ AT TIME ZONE 'America/Chicago';
--
CREATE TABLE weather AS
WITH away AS (
  SELECT time::TIMESTAMP + to_minutes(utc_offset_min) AS ts, * EXCLUDE (time, utc_offset_min)
  FROM read_json('weather/away_hourly.jsonl', columns = {time: 'VARCHAR', temperature_2m: 'DOUBLE', relative_humidity_2m: 'DOUBLE', dew_point_2m: 'DOUBLE', apparent_temperature: 'DOUBLE', pressure_msl: 'DOUBLE', surface_pressure: 'DOUBLE', precipitation: 'DOUBLE', cloud_cover: 'DOUBLE', wind_speed_10m: 'DOUBLE', wind_gusts_10m: 'DOUBLE', shortwave_radiation: 'DOUBLE', elevation: 'DOUBLE', place: 'VARCHAR', utc_offset_min: 'INT'})
)
SELECT * FROM away
UNION ALL BY NAME
SELECT 'home' AS place, utc_to_local(time) AS ts, * EXCLUDE (time)
FROM read_json('weather/hourly.jsonl', columns = {time: 'VARCHAR', temperature_2m: 'DOUBLE', relative_humidity_2m: 'DOUBLE', dew_point_2m: 'DOUBLE', apparent_temperature: 'DOUBLE', pressure_msl: 'DOUBLE', surface_pressure: 'DOUBLE', precipitation: 'DOUBLE', cloud_cover: 'DOUBLE', wind_speed_10m: 'DOUBLE', wind_gusts_10m: 'DOUBLE', shortwave_radiation: 'DOUBLE', elevation: 'DOUBLE'})
WHERE utc_to_local(time)::DATE NOT IN (SELECT ts::DATE FROM away);
--
CREATE TABLE sun AS
SELECT utc_to_local(sunrise)::DATE AS day, utc_to_local(sunrise) AS sunrise, utc_to_local(sunset) AS sunset
FROM read_json('weather/sun.jsonl', columns = {day: 'VARCHAR', sunrise: 'VARCHAR', sunset: 'VARCHAR'});
--
CREATE TABLE outdoor_air AS
WITH away AS (
  SELECT time::TIMESTAMP + to_minutes(utc_offset_min) AS ts, * EXCLUDE (time, utc_offset_min)
  FROM read_json('weather/away_air.jsonl', columns = {time: 'VARCHAR', pm2_5: 'DOUBLE', pm10: 'DOUBLE', ozone: 'DOUBLE', nitrogen_dioxide: 'DOUBLE', us_aqi: 'DOUBLE', dust: 'DOUBLE', place: 'VARCHAR', utc_offset_min: 'INT'})
)
SELECT * FROM away
UNION ALL BY NAME
SELECT 'home' AS place, utc_to_local(time) AS ts, * EXCLUDE (time)
FROM read_json('weather/air.jsonl', columns = {time: 'VARCHAR', pm2_5: 'DOUBLE', pm10: 'DOUBLE', ozone: 'DOUBLE', nitrogen_dioxide: 'DOUBLE', us_aqi: 'DOUBLE', dust: 'DOUBLE'})
WHERE utc_to_local(time)::DATE NOT IN (SELECT ts::DATE FROM away);
--

-- Google Maps Timeline, exported from the phone (2024-08 onward). Times carry
-- the UTC offset of wherever Andrew was, so their wall clock is already local,
-- including on trips. Points look like "38.1°, -90.2°".
CREATE MACRO latlng(s) AS {
  lat: split_part(replace(s, '°', ''), ',', 1)::DOUBLE,
  lon: split_part(replace(s, '°', ''), ',', 2)::DOUBLE};
--
CREATE MACRO km_between(a, b) AS 12742 * asin(sqrt(
  sin(radians(b.lat - a.lat) / 2) ^ 2
  + cos(radians(a.lat)) * cos(radians(b.lat)) * sin(radians(b.lon - a.lon) / 2) ^ 2));
--
CREATE TABLE timeline_segments AS
SELECT unnest(semanticSegments, recursive := false) AS s
FROM read_json('Timeline.json', maximum_object_size = 500000000, columns = {
  semanticSegments: 'STRUCT(
    startTime VARCHAR, endTime VARCHAR, startTimeTimezoneUtcOffsetMinutes INT,
    visit STRUCT(topCandidate STRUCT(placeId VARCHAR, semanticType VARCHAR, placeLocation STRUCT(latLng VARCHAR))),
    activity STRUCT(distanceMeters DOUBLE, topCandidate STRUCT(type VARCHAR))
  )[]'});
--
-- Places Andrew stayed. Google labels home; other kinds (work, aliased) are
-- guesses and not reliable.
CREATE TABLE places AS
WITH v AS (
  SELECT left(s.startTime, 19)::TIMESTAMP AS start, left(s.endTime, 19)::TIMESTAMP AS "end",
    s.startTimeTimezoneUtcOffsetMinutes AS utc_offset_min,
    s.visit.topCandidate.placeId AS place_id,
    lower(s.visit.topCandidate.semanticType) AS kind,
    latlng(s.visit.topCandidate.placeLocation.latLng) AS loc
  FROM timeline_segments WHERE s.visit IS NOT NULL
),
home AS (SELECT {lat: avg(loc.lat), lon: avg(loc.lon)} AS loc FROM v WHERE kind = 'home')
SELECT v.* EXCLUDE (loc), v.loc.lat AS lat, v.loc.lon AS lon,
  CASE WHEN kind = 'home' THEN 0 ELSE round(km_between(v.loc, home.loc), 1) END AS km_from_home
FROM v, home;
--
CREATE TABLE travel AS
SELECT left(s.startTime, 19)::TIMESTAMP AS start, left(s.endTime, 19)::TIMESTAMP AS "end",
  lower(s.activity.topCandidate.type) AS mode,
  round(s.activity.distanceMeters / 1000, 1) AS km
FROM timeline_segments WHERE s.activity IS NOT NULL;
--
DROP TABLE timeline_segments;
--

-- CPAP (ResMed AirSense 11). cpap_nights.date is the evening the night
-- started, so day = date + 1.
CREATE TABLE cpap_nights AS
SELECT date::DATE + 1 AS day, * EXCLUDE (date, mask_on, mask_off),
  mask_on::TIMESTAMP AS mask_on, mask_off::TIMESTAMP AS mask_off
FROM read_json('tables/cpap_nights.jsonl');
--
CREATE TABLE cpap_sessions AS
SELECT trip_local(start::TIMESTAMP) AS start, trip_local("end"::TIMESTAMP) AS "end"
FROM read_json('tables/cpap_sessions.jsonl');
--
CREATE TABLE cpap_events AS
SELECT trip_local(time::TIMESTAMP) AS ts, type, duration_s
FROM read_json('tables/cpap_events.jsonl');
--
CREATE TABLE cpap_minutes AS
SELECT trip_local(time::TIMESTAMP) AS ts, * EXCLUDE (time)
FROM read_json('tables/cpap_minutes.jsonl');
--

-- Google Health (Fitbit Air from 2026-09-24, phone steps from 2025-12-22).
CREATE TABLE heart_rate AS
SELECT
  google_local(heartRate.sampleTime.physicalTime, heartRate.sampleTime.utcOffset) AS ts,
  heartRate.beatsPerMinute::INT AS bpm
FROM read_json('google/heart-rate/*.jsonl');
--
CREATE TABLE hrv AS
SELECT
  google_local(heartRateVariability.sampleTime.physicalTime, heartRateVariability.sampleTime.utcOffset) AS ts,
  heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds AS rmssd_ms
FROM read_json('google/heart-rate-variability/*.jsonl');
--
CREATE TABLE spo2 AS
SELECT
  google_local(oxygenSaturation.sampleTime.physicalTime, oxygenSaturation.sampleTime.utcOffset) AS ts,
  oxygenSaturation.percentage AS pct
FROM read_json('google/oxygen-saturation/*.jsonl');
--
CREATE TABLE sleep AS
SELECT
  name AS id,
  google_local(sleep.interval.startTime, sleep.interval.startUtcOffset) AS start,
  google_local(sleep.interval.endTime, sleep.interval.endUtcOffset) AS "end",
  sleep.type,
  sleep.metadata.mainSleep AS main_sleep,
  sleep.summary.minutesAsleep::INT AS minutes_asleep,
  sleep.summary.minutesAwake::INT AS minutes_awake,
  sleep.summary.minutesToFallAsleep::INT AS minutes_to_fall_asleep,
  (SELECT sum(s.minutes::INT) FROM unnest(sleep.summary.stagesSummary) t(s) WHERE s.type = 'DEEP') AS deep_min,
  (SELECT sum(s.minutes::INT) FROM unnest(sleep.summary.stagesSummary) t(s) WHERE s.type = 'REM') AS rem_min,
  (SELECT sum(s.minutes::INT) FROM unnest(sleep.summary.stagesSummary) t(s) WHERE s.type = 'LIGHT') AS light_min,
  (SELECT sum(s.count::INT) FROM unnest(sleep.summary.stagesSummary) t(s) WHERE s.type = 'AWAKE') AS awake_count
FROM read_json('google/sleep/*.jsonl');
--
CREATE TABLE sleep_stages AS
SELECT
  name AS sleep_id,
  google_local(s.startTime, s.startUtcOffset) AS start,
  google_local(s.endTime, s.endUtcOffset) AS "end",
  s.type AS stage
FROM read_json('google/sleep/*.jsonl'), unnest(sleep.stages) t(s);
--
CREATE TABLE steps AS
SELECT
  google_local(steps.interval.startTime, steps.interval.startUtcOffset) AS ts,
  steps.count::INT AS steps,
  dataSource.device.formFactor AS device
FROM read_json('google/steps/*.jsonl');
--
CREATE TABLE exercise AS
SELECT
  google_local(exercise.interval.startTime, exercise.interval.startUtcOffset) AS start,
  google_local(exercise.interval.endTime, exercise.interval.endUtcOffset) AS "end",
  exercise.exerciseType AS type,
  exercise.metricsSummary.averageHeartRateBeatsPerMinute::INT AS avg_bpm,
  exercise.metricsSummary.activeZoneMinutes::INT AS active_zone_min
FROM read_json('google/exercise/*.jsonl');
--
CREATE TABLE weight AS
SELECT
  google_local(weight.sampleTime.physicalTime, weight.sampleTime.utcOffset) AS ts,
  weight.weightGrams / 1000 AS kg
FROM read_json('google/weight/*.jsonl');
--

-- Fitbit's once-a-day numbers, all keyed by the day they describe.
CREATE TABLE fitbit_daily AS
SELECT
  coalesce(rhr.day, hrv.day, o2.day, rr.day, temp.day) AS day,
  rhr.bpm AS resting_hr,
  hrv.avg_ms AS hrv_ms,
  hrv.deep_sleep_ms AS hrv_deep_sleep_ms,
  o2.avg_pct AS spo2_avg,
  o2.low_pct AS spo2_low,
  rr.bpm AS breathing_rate,
  temp.deviation_c AS skin_temp_deviation_c
FROM (
  SELECT civil_date(dailyRestingHeartRate.date) AS day, dailyRestingHeartRate.beatsPerMinute::INT AS bpm
  FROM read_json('google/daily-resting-heart-rate/*.jsonl')
) rhr
FULL JOIN (
  SELECT civil_date(dailyHeartRateVariability.date) AS day,
    dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds AS avg_ms,
    dailyHeartRateVariability.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds AS deep_sleep_ms
  FROM read_json('google/daily-heart-rate-variability/*.jsonl')
) hrv USING (day)
FULL JOIN (
  SELECT civil_date(dailyOxygenSaturation.date) AS day,
    dailyOxygenSaturation.averagePercentage AS avg_pct,
    dailyOxygenSaturation.lowerBoundPercentage AS low_pct
  FROM read_json('google/daily-oxygen-saturation/*.jsonl')
) o2 USING (day)
FULL JOIN (
  SELECT civil_date(dailyRespiratoryRate.date) AS day, dailyRespiratoryRate.breathsPerMinute AS bpm
  FROM read_json('google/daily-respiratory-rate/*.jsonl')
) rr USING (day)
FULL JOIN (
  SELECT civil_date(dailySleepTemperatureDerivations.date) AS day,
    dailySleepTemperatureDerivations.nightlyTemperatureCelsius::DOUBLE
      - dailySleepTemperatureDerivations.baselineTemperatureCelsius::DOUBLE AS deviation_c
  FROM read_json('google/daily-sleep-temperature-derivations/*.jsonl')
) temp USING (day);
--

-- Google Calendar headache log, 2021 onward. Titles like "Headache
-- (<medication>)" carry the medication and suspected cause. Times are
-- converted to wherever Andrew was.
CREATE TABLE headaches AS
SELECT
  coalesce(trip_local(start.dateTime::TIMESTAMPTZ AT TIME ZONE 'America/Chicago'), start.date::TIMESTAMP) AS start,
  coalesce(trip_local("end".dateTime::TIMESTAMPTZ AT TIME ZONE 'America/Chicago'), "end".date::TIMESTAMP) AS "end",
  summary AS title
FROM read_json('calendar/primary.json', format = 'array', columns = {
  summary: 'VARCHAR',
  start: 'STRUCT(dateTime TIMESTAMPTZ, date DATE)',
  "end": 'STRUCT(dateTime TIMESTAMPTZ, date DATE)'
})
WHERE summary ILIKE '%headache%' OR summary ILIKE '%triptan%' OR summary ILIKE '%migraine%';
--

-- Tags Claude assigned to journal notes (vocabulary in data/tags/README.md),
-- one row per day and tag.
CREATE TABLE note_tags AS
SELECT column0::DATE AS day, unnest(string_split(column1, ',')) AS tag
FROM read_csv('tags/journal-notes.tsv', delim = '\t', header = false,
  columns = {'column0': 'VARCHAR', 'column1': 'VARCHAR'})
WHERE column1 <> '';
--

-- Dated life events that change the baseline: surgeries, medications, CPAP
-- changes, jobs, new data sources.
CREATE TABLE timeline AS
SELECT date::DATE AS day, kind, event
FROM read_csv('timeline.tsv', delim = '\t', header = true, all_varchar = true);
--

-- One row per day, with every source summarized by the day rule. Overnight
-- columns describe the night that ended that morning.
CREATE TABLE days AS
WITH spine AS (
  SELECT unnest(range(DATE '2021-01-01', current_date + 1, INTERVAL 1 DAY))::DATE AS day
),
cal AS (
  SELECT start::DATE AS day,
    count(*) AS headache_events,
    min(start)::TIME AS headache_first_time,
    bool_or(title ILIKE '%triptan%' AND NOT regexp_matches(title, '(?i)no\s+\w*triptan')) AS triptan,
    nullif(string_agg(nullif(regexp_extract(title, '\((.*)\)', 1), ''), '; '), '') AS headache_note
  FROM headaches GROUP BY ALL
),
cpap AS (
  SELECT n.day, n.usage_min AS cpap_usage_min, n.mask_on AS cpap_mask_on,
    n.mask_off AS cpap_mask_off, n.mask_sessions - 1 AS cpap_breaks,
    n.ahi, n.obstructive_ai, n.central_ai, n.hypopnea_index, n.leak_95,
    n.resp_rate_50 AS cpap_resp_rate
  FROM cpap_nights n
),
-- Bedtime, final wake, and insomnia from mask on/off sessions. Naps
-- (sessions entirely between 11am and 6pm) don't count. Andrew's insomnia
-- happens 3-6am and takes 90+ min to pass, so an insomnia wake is a mask-off
-- between 3:00 and 5:59 followed by 30+ minutes without the mask (lying
-- awake, or up for the day).
cpap_sleep AS (
  SELECT day, min(start) AS bedtime, max("end") AS final_wake,
    min("end") FILTER (WHERE hour("end") BETWEEN 3 AND 5
      AND coalesce(date_diff('minute', "end", next_start), 999) >= 30) AS insomnia_wake,
    coalesce(sum(date_diff('minute', "end", next_start)) FILTER (
      WHERE next_start IS NOT NULL AND hour("end") < 9
        AND date_diff('minute', "end", next_start) >= 20), 0) AS awake_mid_night_min
  FROM (
    SELECT night_day("end") AS day, start, "end",
      lead(start) OVER (PARTITION BY night_day("end") ORDER BY start) AS next_start
    FROM cpap_sessions
    WHERE NOT (hour(start) BETWEEN 11 AND 17 AND hour("end") BETWEEN 11 AND 17)
  )
  GROUP BY ALL
),
cpap_ev AS (
  SELECT night_day(ts) AS day, count(*) FILTER (WHERE type = 'Arousal') AS cpap_arousals
  FROM cpap_events GROUP BY ALL
),
fit AS (
  SELECT night_day("end") AS day, start AS fitbit_sleep_start, "end" AS fitbit_wake,
    minutes_asleep, minutes_awake, deep_min, rem_min, light_min, awake_count
  FROM sleep WHERE main_sleep
  QUALIFY row_number() OVER (PARTITION BY night_day("end") ORDER BY minutes_asleep DESC) = 1
),
-- Wakes from Fitbit sleep stages. These catch time awake with the mask still
-- on, which the CPAP can't see (Andrew rests with it on for up to an hour
-- before giving up). Awake stages less than 5 minutes apart count as one wake.
fit_wakes AS (
  SELECT sleep_id, min(start) AS start, max("end") AS "end",
    date_diff('minute', min(start), max("end")) AS minutes,
    arg_min(stage_before, start) AS stage_before
  FROM (
    SELECT *, sum(new_wake::INT) OVER (PARTITION BY sleep_id ORDER BY start) AS wake_no
    FROM (
      SELECT *, coalesce(start > lag("end") OVER w + INTERVAL 5 MINUTE, true) AS new_wake
      FROM (
        SELECT *, lag(stage) OVER (PARTITION BY sleep_id ORDER BY start) AS stage_before
        FROM sleep_stages
      )
      WHERE stage = 'AWAKE'
      WINDOW w AS (PARTITION BY sleep_id ORDER BY start)
    )
  )
  GROUP BY sleep_id, wake_no
),
fit_night AS (
  SELECT night_day(s."end") AS day,
    -- Minutes from mask on (or Fitbit's sleep start) to the first sleep stage.
    date_diff('minute', coalesce(cs.bedtime, s.start),
      (SELECT min(st.start) FROM sleep_stages st WHERE st.sleep_id = s.id AND st.stage <> 'AWAKE')) AS fitbit_sleep_onset_min,
    -- Awake after first falling asleep, until Fitbit's sleep ends.
    coalesce(sum(w.minutes) FILTER (WHERE w.stage_before IS NOT NULL), 0) AS fitbit_awake_in_bed_min,
    min(w.start) FILTER (WHERE w.minutes >= 30 AND w.stage_before IS NOT NULL) AS fitbit_long_wake,
    arg_min(w.minutes, w.start) FILTER (WHERE w.minutes >= 30 AND w.stage_before IS NOT NULL) AS fitbit_long_wake_min,
    arg_min(w.stage_before, w.start) FILTER (WHERE w.minutes >= 30 AND w.stage_before IS NOT NULL) AS fitbit_long_wake_from,
    -- Same idea as the CPAP insomnia flag: 30+ minutes awake starting
    -- 3-6am, or up for good in that window.
    bool_or(w.minutes >= 30 AND w.stage_before IS NOT NULL AND hour(w.start) BETWEEN 3 AND 5)
      OR hour(any_value(s."end")) BETWEEN 3 AND 5 AS fitbit_insomnia
  FROM sleep s
  LEFT JOIN fit_wakes w ON w.sleep_id = s.id
  LEFT JOIN cpap_sleep cs ON cs.day = night_day(s."end")
  WHERE s.main_sleep
  GROUP BY s.id, s.start, s."end", cs.bedtime
  QUALIFY row_number() OVER (PARTITION BY night_day(s."end") ORDER BY any_value(s.minutes_asleep) DESC) = 1
),
bedroom AS (
  SELECT night_day(ts) AS day,
    round(avg(co2_ppm)) AS bedroom_co2_avg, max(co2_ppm) AS bedroom_co2_max,
    round(avg(temp_c), 1) AS bedroom_temp_c, round(avg(humidity_pct)) AS bedroom_humidity
  FROM air WHERE hour(ts) >= 22 OR hour(ts) < 6 GROUP BY ALL
),
indoor_day AS (
  SELECT ts::DATE AS day, round(avg(co2_ppm)) AS indoor_co2_day_avg
  FROM air WHERE hour(ts) BETWEEN 7 AND 21 GROUP BY ALL
),
wx AS (
  SELECT ts::DATE AS day,
    round(min(temperature_2m), 1) AS outdoor_temp_min, round(max(temperature_2m), 1) AS outdoor_temp_max,
    round(avg(relative_humidity_2m)) AS outdoor_humidity, round(avg(dew_point_2m), 1) AS dew_point,
    round(avg(pressure_msl), 1) AS pressure_avg,
    round(max(pressure_msl) - min(pressure_msl), 1) AS pressure_range,
    round(sum(precipitation), 1) AS precip_mm, round(avg(cloud_cover)) AS cloud_cover,
    max(wind_gusts_10m) AS wind_gust_max,
    round(avg(elevation)) AS elevation_m
  FROM weather GROUP BY ALL
),
-- Change in sea-level pressure over the 24 hours before 8am, at one place
-- (null the first day at a new place).
wx_change AS (
  SELECT ts::DATE AS day,
    round(pressure_msl - first_value(pressure_msl) OVER (PARTITION BY place ORDER BY ts
      RANGE BETWEEN INTERVAL 24 HOUR PRECEDING AND INTERVAL 24 HOUR PRECEDING), 1) AS pressure_change_24h
  FROM weather QUALIFY hour(ts) = 8
),
aq AS (
  SELECT ts::DATE AS day, round(avg(pm2_5), 1) AS pm25, max(us_aqi) AS aqi_max, round(max(ozone)) AS ozone_max
  FROM outdoor_air GROUP BY ALL
),
-- Where Andrew slept: the place he was at 3am, by the night rule. Null when
-- Timeline has no visit then (gaps, or before 2024-08).
slept AS (
  SELECT d.day,
    p.km_from_home AS slept_km_from_home,
    -- Hours ahead of home time (America/Chicago) at 3am.
    round(date_diff('minute',
      ((d.day + TIME '03:00' - to_minutes(p.utc_offset_min))::VARCHAR || '+00')::TIMESTAMPTZ AT TIME ZONE 'America/Chicago',
      d.day + TIME '03:00') / 60, 1) AS tz_shift_h
  FROM spine d
  JOIN places p ON d.day + TIME '03:00' BETWEEN p.start AND p."end"
  QUALIFY row_number() OVER (PARTITION BY d.day ORDER BY p.start DESC) = 1
),
-- Daytime whereabouts (calendar day). Days with no Timeline data are null.
outings AS (
  SELECT day,
    max(km_from_home) AS km_from_home_max,
    round(coalesce(sum(minutes) FILTER (WHERE kind <> 'home'), 0) / 60, 1) AS hours_out,
    count(DISTINCT place_id) FILTER (WHERE kind <> 'home' AND minutes >= 10) AS places_visited
  FROM (
    SELECT d.day, p.place_id, p.kind, p.km_from_home,
      date_diff('minute', greatest(p.start, d.day::TIMESTAMP), least(p."end", d.day + INTERVAL 1 DAY)) AS minutes
    FROM places p,
      LATERAL (SELECT unnest(range(p.start::DATE, p."end"::DATE + 1, INTERVAL 1 DAY))::DATE AS day) d
  ) GROUP BY ALL
),
trips_day AS (
  SELECT start::DATE AS day,
    sum(date_diff('minute', start, "end")) FILTER (WHERE mode IN ('in_passenger_vehicle', 'in_bus')) AS drive_min,
    bool_or(mode = 'flying') AS flew
  FROM travel GROUP BY ALL
),
-- Phone and watch both count steps, so take whichever counted more.
tag_days AS (
  SELECT day, list(tag ORDER BY tag) AS tags FROM note_tags GROUP BY ALL
),
step_days AS (
  SELECT day, max(total) AS steps FROM (
    SELECT ts::DATE AS day, device, sum(steps) AS total FROM steps GROUP BY ALL
  ) GROUP BY ALL
)
SELECT
  spine.day,
  dayname(spine.day) AS weekday,
  j.energy, j.mood, j.anxiety, j.headache, j.exercise, j.notes,
  coalesce(cal.headache_events, 0) AS headache_events,
  cal.headache_first_time, coalesce(cal.triptan, false) AS triptan, cal.headache_note,
  coalesce(tag_days.tags, []) AS tags,
  cpap.* EXCLUDE (day), cpap_ev.cpap_arousals,
  cs.bedtime, cs.final_wake, cs.awake_mid_night_min, cs.insomnia_wake,
  cs.insomnia_wake IS NOT NULL AS insomnia,
  fit.* EXCLUDE (day),
  fn.* EXCLUDE (day),
  fd.* EXCLUDE (day),
  bedroom.* EXCLUDE (day), indoor_day.indoor_co2_day_avg,
  wx.* EXCLUDE (day), wx_change.pressure_change_24h,
  aq.* EXCLUDE (day),
  step_days.steps,
  slept.slept_km_from_home, slept.tz_shift_h,
  outings.km_from_home_max, outings.hours_out, outings.places_visited,
  CASE WHEN outings.day IS NOT NULL THEN coalesce(trips_day.drive_min, 0) END AS drive_min,
  CASE WHEN outings.day IS NOT NULL THEN coalesce(trips_day.flew, false) END AS flew
FROM spine
LEFT JOIN journal j USING (day)
LEFT JOIN cal USING (day)
LEFT JOIN cpap USING (day)
LEFT JOIN cpap_ev USING (day)
LEFT JOIN cpap_sleep cs USING (day)
LEFT JOIN fit USING (day)
LEFT JOIN fit_night fn USING (day)
LEFT JOIN fitbit_daily fd USING (day)
LEFT JOIN bedroom USING (day)
LEFT JOIN indoor_day USING (day)
LEFT JOIN wx USING (day)
LEFT JOIN wx_change USING (day)
LEFT JOIN aq USING (day)
LEFT JOIN step_days USING (day)
LEFT JOIN tag_days USING (day)
LEFT JOIN slept USING (day)
LEFT JOIN outings USING (day)
LEFT JOIN trips_day USING (day)
LEFT JOIN sun USING (day)
ORDER BY spine.day;
