#!/usr/bin/env python3
"""Scores forecast sources against St. Louis Lambert's hourly readings.

Run with python3 weatherStation/scoreForecasts.py. Prints each source's typical
error by how far ahead the forecast was made, and what correcting with an
hour-old airport reading would gain. The README has the last results.
"""
import csv
import datetime as dt
import io
import json
import math
import statistics as st
import urllib.request

DAYS = 60
AIRPORT = 'latitude=38.75&longitude=-90.37'
SOURCES = {'best_match': 'default', 'ncep_nbm_conus': 'Blend', 'ecmwf_ifs025': 'ECMWF'}
AGES = [0, 1, 2, 3, 5, 7]
FIELDS = {'temperature_2m': 'air', 'dew_point_2m': 'dew point', 'wind_speed_10m': 'wind'}


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'weatherstation-score'})
    return urllib.request.urlopen(request, timeout=120).read().decode()


def fetch_readings():
    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(days=DAYS)
    text = get(
        'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=STL'
        '&data=tmpf&data=dwpf&data=sknt'
        f'&year1={start.year}&month1={start.month}&day1={start.day}'
        f'&year2={end.year}&month2={end.month}&day2={end.day}&hour2=23'
        '&tz=Etc/UTC&format=onlycomma&latlon=no&missing=null&direct=no&report_type=3'
    )
    number = lambda value: None if value == 'null' else float(value)
    readings = {}
    for row in csv.DictReader(io.StringIO(text)):
        time = dt.datetime.strptime(row['valid'], '%Y-%m-%d %H:%M')
        if time.minute < 45:
            continue
        # Airports report at :51, so that reading stands for the next hour.
        hour = (time + dt.timedelta(hours=1)).replace(minute=0)
        knots = number(row['sknt'])
        readings[hour] = {
            'temperature_2m': number(row['tmpf']),
            'dew_point_2m': number(row['dwpf']),
            'wind_speed_10m': None if knots is None else knots * 1.15078,
        }
    return readings


def field_name(field, age):
    return field if age == 0 else f'{field}_previous_day{age}'


def fetch_forecasts(model):
    names = [field_name(f, age) for f in FIELDS for age in AGES]
    hourly = json.loads(get(
        f'https://previous-runs-api.open-meteo.com/v1/forecast?{AIRPORT}'
        f'&hourly={",".join(names)}&models={model}&past_days={DAYS}&forecast_days=1'
        '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=GMT'
    ))['hourly']
    times = [dt.datetime.strptime(t, '%Y-%m-%dT%H:%M') for t in hourly['time']]
    return {
        name: {t: v for t, v in zip(times, hourly[name]) if v is not None}
        for name in names
    }


def typical_error(forecast, readings, field):
    errors = [
        forecast[t] - reading[field]
        for t, reading in readings.items()
        if t in forecast and reading[field] is not None
    ]
    return st.mean(map(abs, errors)) if errors else None


def corrected(forecast, readings, hours, fade_hours=6):
    out = {}
    for t in readings:
        earlier = t - dt.timedelta(hours=hours)
        air = readings.get(earlier, {}).get('temperature_2m')
        if t in forecast and earlier in forecast and air is not None:
            out[t] = forecast[t] + (air - forecast[earlier]) * math.exp(-hours / fade_hours)
    return out


readings = fetch_readings()
forecasts = {model: fetch_forecasts(model) for model in SOURCES}
print(f'{len(readings)} hours of readings, {min(readings)} to {max(readings)}\n')

for field, label in FIELDS.items():
    print(f'{label}, typical error')
    for age in AGES:
        cells = []
        for model, source in SOURCES.items():
            error = typical_error(forecasts[model][field_name(field, age)], readings, field)
            cells.append(f'{source} {error:.1f}' if error is not None else f'{source} -')
        print(f'  {age} days ahead: ' + ' | '.join(cells))
    print()

print('air, latest run corrected with an airport reading')
for model, source in SOURCES.items():
    forecast = forecasts[model]['temperature_2m']
    plain = typical_error(forecast, readings, 'temperature_2m')
    cells = [
        f'{h}h old {typical_error(corrected(forecast, readings, h), readings, "temperature_2m"):.2f}'
        for h in (1, 3, 6)
    ]
    print(f'  {source}: uncorrected {plain:.2f} | ' + ' | '.join(cells))
