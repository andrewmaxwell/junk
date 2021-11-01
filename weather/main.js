const charts = [
  {
    feels_like: {label: 'Feels Like', color: 'red'},
    temp: {label: 'Temperature', color: 'green'},
    dew_point: {label: 'Dew Point', color: 'blue'},
  },
  {
    clouds: {label: 'Clouds', color: 'gray'},
    humidity: {label: 'Humidity', color: 'cyan'},
    pop: {label: 'Precip', color: 'purple'},
  },
  {
    pressure: {label: 'Pressure', color: 'yellow'},
  },
  {
    wind_speed: {label: 'Wind Speed', color: 'green'},
    wind_gust: {label: 'Gust Speed', color: 'red'},
  },
];

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayParts = [
  {prop: 'morn', hour: -4}, // 8am
  {prop: 'day', hour: 3}, // 3pm
  {prop: 'eve', hour: 8}, // 8pm
  {prop: 'night', hour: 12}, // midnight
];

const toDate = (epoch) => {
  const d = new Date(epoch * 1000);
  return `${weekDays[d.getDay()]} ${d.getHours()}:${String(
    d.getMinutes()
  ).padStart(2, 0)}`;
};

const combineData = (hourly, daily) =>
  [
    ...hourly,
    ...daily
      .filter((d) => d.dt > hourly[hourly.length - 1].dt)
      .flatMap((d) =>
        dayParts.map(({prop, hour}) => ({
          ...d,
          feels_like: d.feels_like[prop],
          temp: d.temp[prop],
          dt: d.dt + hour * 3600,
        }))
      ),
  ]
    .sort((a, b) => a.dt - b.dt)
    .map((p) => ({...p, pop: p.pop * 100}));

const addChart = (combinedData, daily, props) => {
  const canvas = document.createElement('canvas');
  const h3 = document.createElement('h3');
  h3.innerHTML = Object.entries(props)
    .map(([, {label, color}]) => `<span style="color:${color}">${label}</span>`)
    .join(', ');
  document.body.append(h3);
  document.body.append(canvas);

  const ctx = canvas.getContext('2d');
  const W = (canvas.width = innerWidth);
  const H = (canvas.height = 400);

  let minX = combinedData[0].dt;
  let maxX = combinedData[combinedData.length - 1].dt;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const d of combinedData) {
    for (const key in props) {
      minY = Math.min(minY, d[key]);
      maxY = Math.max(maxY, d[key]);
    }
  }

  const toX = (x) => W * ((x - minX) / (maxX - minX));
  const toY = (y) => H - (H * (y - minY)) / (maxY - minY);

  // SUNSHINE BOXES
  ctx.fillStyle = 'rgba(255,255,0,0.1)';
  for (const {sunrise, sunset} of daily) {
    const x = toX(sunrise);
    ctx.fillRect(x, 0, toX(sunset) - x, H);
    ctx.fillText(toDate(x), x, 1);
  }

  // LINES
  ctx.lineWidth = 2;
  for (const key in props) {
    ctx.strokeStyle = props[key].color;
    ctx.beginPath();
    for (const d of combinedData) {
      ctx.lineTo(toX(d.dt), toY(d[key]));
    }
    ctx.stroke();
  }

  // GRID LINES AND AXIS LABELS
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  const ySpacing = Math.max(1, (20 / H) * (maxY - minY));
  for (let i = minY; i <= maxY; i += ySpacing) {
    const y = toY(i);
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // AXIS LABELS
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'top';
  ctx.font = '14px sans-serif';
  for (let i = minY; i <= maxY; i += ySpacing) {
    ctx.fillText(Math.round(i), 0, toY(i) + 1);
  }

  // DESCRIPTIONS
  for (const {sunrise, sunset, weather} of daily) {
    ctx.fillText(toDate(sunrise), toX(sunrise), 1);
    ctx.fillText(toDate(sunset), toX(sunset), 1);
    ctx.fillText(weather[0].description, toX(sunrise), 15);
  }
};

const makeCharts = (data) => {
  console.log(data);

  const {
    current: {
      feels_like,
      dew_point,
      wind_speed,
      weather: [{description}],
    },
    daily,
    hourly,
  } = data;

  document.body.innerHTML += `
  
<h3>Currently ${description}, feels like ${Math.round(
    feels_like
  )}&deg;, ${Math.round(dew_point)}&deg; dew point, ${Math.round(
    wind_speed
  )} mph wind</h3>`;

  const combinedData = combineData(hourly, daily);

  for (const props of charts) {
    addChart(combinedData, daily, props);
  }
};

navigator.geolocation.getCurrentPosition(
  async ({coords: {latitude, longitude}}) => {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/onecall?lat=${latitude}&lon=${longitude}&units=imperial&lang=en&exclude=minutely&appid=825cf378ed74870f834683104cb4102a`
    );
    makeCharts(await response.json());
  }
);
