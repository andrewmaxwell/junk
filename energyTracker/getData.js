const getWeatherData = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=38.8&longitude=-90.3&start_date=2022-04-21&end_date=${today}&hourly=apparent_temperature,precipitation,surface_pressure&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FChicago`;
  const weather = await (await fetch(weatherUrl)).json();
  const {time, apparent_temperature, precipitation, surface_pressure} =
    weather.hourly;
  return time
    .map((time, i) => ({
      time: Date.parse(time),
      temperature: apparent_temperature[i],
      precipitation: precipitation[i],
      pressure: surface_pressure[i],
    }))
    .filter((ob) => ob.pressure);
};

const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSJVwYZ2gbAbspXeH2zmZE9S5tXw1J7GyPOfuPJ-7hVu7XggltJrZ0i7G-nNhWzCi502wz5qBq4pQ3X/pub?output=csv';
export const getData = async () => {
  const [text, weatherData] = await Promise.all([
    fetch(url).then((r) => r.text()),
    getWeatherData(),
  ]);

  const data = window.Papa.parse(text, {header: true}).data.map((row) => ({
    time: Date.parse(row.Timestamp),
    tstamp: row.Timestamp,
    energy: +row['Energy Level'],
    anxiety: +row['Anxiety Level'],
    headache: +row.Headache,
    mood: +row.Mood,
    exercise: +row.Exercise,
    notes: row.Notes,
  }));

  let weatherIndex = 0;
  for (const ob of data) {
    let count = 0;
    let temperature = 0;
    let precipitation = 0;
    let pressure = 0;
    while (weatherData[weatherIndex]?.time <= ob.time) {
      const w = weatherData[weatherIndex];
      temperature += w.temperature;
      precipitation += w.precipitation;
      pressure += w.pressure;
      count++;
      weatherIndex++;
    }
    if (count) {
      ob.temperature = Math.round(temperature / count);
      ob.precipitation = Math.round(precipitation * 1000) / 1000;
      ob.pressure = Math.round(pressure / count);
    }
  }

  console.log('data', data);
  return data;
};
