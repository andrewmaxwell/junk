const url = `https://archive-api.open-meteo.com/v1/archive?latitude=38.8&longitude=-90.3&start_date=2022-04-21&end_date=2024-12-20&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,cloud_cover,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FChicago`;
const resp = await fetch(url);
const {hourly} = await resp.json();

const data = [
  [
    'time',
    'temperature (F)',
    'relative humidity (percent)',
    'dew point (F)',
    'apparent temperature (F)',
    'precipitation (inches)',
    'cloudCover (percent)',
    'windSpeed (mph)',
  ],
  ...hourly.time.map((time, i) =>
    [
      time,
      hourly.temperature_2m[i],
      hourly.relative_humidity_2m[i],
      hourly.dew_point_2m[i],
      hourly.apparent_temperature[i],
      hourly.precipitation[i],
      hourly.cloud_cover[i],
      hourly.wind_speed_10m[i],
    ].join(',')
  ),
].join('\n');

import fs from 'fs';
fs.writeFileSync('weather.csv', data);
