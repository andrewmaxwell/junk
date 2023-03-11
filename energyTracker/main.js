const {Papa} = window;

const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSJVwYZ2gbAbspXeH2zmZE9S5tXw1J7GyPOfuPJ-7hVu7XggltJrZ0i7G-nNhWzCi502wz5qBq4pQ3X/pub?output=csv';

const getData = async () =>
  Papa.parse(await (await fetch(url)).text(), {header: true}).data.map(
    (row) => ({
      time: Date.parse(row.Timestamp),
      tstamp: row.Timestamp,
      energy: +row['Energy Level'],
      anxiety: +row['Anxiety Level'],
      headache: +row.Headache,
      mood: +row.Mood,
      exercise: +row.Exercise,
      notes: row.Notes,
    })
  );

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

const smoothLine = (coords, steps = 16) => {
  const result = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const c = coords[i];
    const n = coords[i + 1];
    result.push(c);
    for (let j = 0; j < steps; j++) {
      result.push({
        x: c.x + (j / steps) * (n.x - c.x),
        y: c.y + ease(j / steps) * (n.y - c.y),
      });
    }
  }
  return result;
};

const graphs = [
  {key: 'overall', color: 'white'},
  {key: 'energy', color: 'yellow'},
  {key: 'anxiety', color: 'magenta'},
  {key: 'headache', color: 'red'},
  {key: 'mood', color: 'green'},
  {key: 'exercise', color: 'cyan'},
];

const canvasHeight = (innerHeight - (graphs.length - 1) * 10) / graphs.length;

const go = async () => {
  const data = await getData();

  for (const ob of data) {
    ob.overall =
      (ob.energy +
        (5 - ob.anxiety) +
        (5 - ob.headache) +
        ob.mood +
        ob.exercise) /
      5;
  }

  const minX = data[0].time;
  const maxX = data[data.length - 1].time;
  const maxY = 5;

  for (const {key, color} of graphs) {
    const canvas = document.createElement('canvas');
    canvas.width = innerWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    const coords = data.map((ob) => ({
      x: ((ob.time - minX) / (maxX - minX)) * innerWidth,
      y: (1 - ob[key] / maxY) * canvasHeight,
      ob,
    }));

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const {x, y} of smoothLine(coords)) {
      ctx.lineTo(x, y);
    }
    ctx.lineTo(innerWidth, canvasHeight);
    ctx.lineTo(0, canvasHeight);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top';
    ctx.font = '16px sans-serif';
    ctx.fillText(key, 3, 3);
    document.body.append(canvas);

    canvas.addEventListener('mousemove', (e) => {
      let minDist = Infinity;
      let closest;
      for (const {x, ob} of coords) {
        const d = Math.abs(x - e.pageX);
        if (d < minDist) {
          minDist = d;
          closest = ob;
        }
      }

      canvas.title = [
        closest.tstamp,
        ...graphs.map(({key}) => `${key}: ${closest[key]}`),
        closest.notes ? `Notes: ${closest.notes}` : '',
      ]
        .join('\n')
        .trim();
    });
  }
  console.log(data);
};

go();
