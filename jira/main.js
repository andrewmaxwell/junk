const {Papa, Chart} = window;

// const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
// const getStats = (arr) => {
//   const m = mean(arr);
//   return {mean: m, stdDev: Math.sqrt(mean(arr.map((v) => (v - m) ** 2))), arr};
// };

// const rollingStats = (data, duration, numPts = 256) => {
//   const result = [];
//   const minX = data[0].x;
//   let maxX = data[data.length - 1].x;
//   let minIndex = 0;
//   let maxIndex = 0;
//   let prev;
//   for (let i = 0; i < numPts; i++) {
//     const x = minX + (i / numPts) * (maxX - minX);
//     while (data[minIndex]?.x < x - duration && minIndex < data.length)
//       minIndex++;
//     while (data[maxIndex]?.x < x && maxIndex < data.length) maxIndex++;
//     // console.log('>>>', data.slice(minIndex, maxIndex));
//     const {mean, stdDev} = getStats(
//       data.slice(minIndex, maxIndex).map(({y}) => y)
//     );
//     result.push(
//       isNaN(mean) && prev ? {...prev, x} : (prev = {x, y: mean, r: stdDev})
//     );
//   }
//   console.log(result);
//   return result;
// };

const colors = {
  0.5: [255, 255, 0], // yellow
  1: [0, 255, 0], // green
  2: [0, 255, 255], // cyan
  3: [0, 0, 255], // blue
  4: [255, 0, 255], // magenta
  5: [255, 0, 0], // red
  8: [255, 128, 0], // orange
};

const groupBy = (func, arr) => {
  const res = {};
  for (const t of arr) {
    const key = func(t);
    (res[key] = res[key] || []).push(t);
  }
  return res;
};

const bezier = (coords, numPoints = 32) => {
  const result = [];
  const xc = new Float32Array(coords.length);
  const yc = new Float32Array(coords.length);
  for (let i = 0; i < numPoints; i++) {
    for (let j = 0; j < coords.length; j++) {
      xc[j] = coords[j].x;
      yc[j] = coords[j].y;
    }
    const p = (i + 1) / (numPoints + 1);
    for (let j = 1; j < coords.length; j++) {
      for (let k = 0; k < coords.length - j; k++) {
        xc[k] = xc[k] * (1 - p) + xc[k + 1] * p;
        yc[k] = yc[k] * (1 - p) + yc[k + 1] * p;
      }
    }
    result[i] = {x: xc[0], y: yc[0]};
  }
  return result;
};

const changeOverTime = (arr, duration) => {
  let minIndex = 0;
  return arr.map((e) => {
    while (arr[minIndex + 1]?.x < e.x - duration) minIndex++;
    return {...e, y: e.y - arr[minIndex].y};
  });
};

const makeChart = (label, datasets) => {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.append(canvas);

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {datasets},
    options: {
      scales: {xAxes: [{type: 'time', time: {tooltipFormat: 'll'}}]},
      title: {text: label, display: true, fontSize: 20},
      animation: {duration: 0},

      tooltips: {
        callbacks: {
          label: ({index, datasetIndex}, {datasets}) =>
            datasets[datasetIndex].data[index].label,
        },
      },
    },
  });
};

const go = async () => {
  const csv = await fetch('data.csv').then((r) => r.text());
  const {data} = Papa.parse(csv, {header: true});

  const workOverTime = data
    .filter(({estimate}) => Number(estimate))
    .map((e) => {
      const {assignees, days, epic, estimate, finished, key, summary} = e;
      return {
        ...e,
        x: Date.parse(finished),
        label: [
          `${key}: ${summary} (${epic})`,
          `${estimate} point${estimate == 1 ? '' : 's'} in ${days} days`,
          assignees,
          new Date(finished).toLocaleString(),
        ],
      };
    })
    .sort((a, b) => a.x - b.x);

  makeChart(
    'Days to Complete Stories',
    Object.entries(groupBy((t) => t.estimate, workOverTime))
      .filter(([, arr]) => arr.length > 5)
      .sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([points, items]) => {
        const vals = items
          .map((e) => ({...e, y: Number(e.days), r: 5}))
          .filter(({y}) => y < 50);

        if (points == 3) {
          const min = vals[0].x;
          const max = vals[vals.length - 1].x;
          console.log(
            vals.map((v) => (v.x - min) / (max - min) + ',' + v.y).join(';')
          );
        }

        return [
          {
            label: `${points} point`,
            type: 'bubble',
            data: vals,
            backgroundColor: `rgba(${colors[points]},0.25)`,
          },
          {
            label: `${points} point bezier`,
            type: 'line',
            data: bezier(vals).map((el) => ({
              ...el,
              label: points + ' points',
            })),
            fill: false,
            borderColor: `rgba(${colors[points]},0.5)`,
          },
          // {
          //   label: `${points} point mean/stddev`,
          //   type: 'bubble',
          //   data: rollingStats(vals, 8 * 14 * 24 * 3600 * 1000),
          //   backgroundColor: `rgba(${colors[points]},0.25)`,
          //   borderColor: 'rgba(0,0,0,0)',
          // },
        ];
      })
  );

  let total = 0;
  const pointsOverTime = changeOverTime(
    workOverTime.map((e) => ({
      ...e,
      y: (total += Number(e.estimate)),
    })),
    14 * 24 * 3600 * 1000
  );
  makeChart('Points per 14 days', [
    {
      label: 'Velocity',
      type: 'line',
      data: pointsOverTime,
      tension: 0,
      fill: false,
    },
    {
      label: 'Velocity Bezier',
      type: 'line',
      data: bezier(pointsOverTime, 100),
      fill: false,
      borderColor: 'blue',
    },
  ]);

  let total2 = 0;
  const daysAssignedOverTime = changeOverTime(
    workOverTime.map((e) => ({
      ...e,
      y: (total2 += Number(e.days)),
    })),
    14 * 24 * 3600 * 1000
  );
  makeChart('Days Assigned per 14 days', [
    {
      label: 'Velocity',
      type: 'line',
      data: daysAssignedOverTime,
      tension: 0,
      fill: false,
    },
    {
      label: 'Velocity Bezier',
      type: 'line',
      data: bezier(daysAssignedOverTime, 100),
      fill: false,
      borderColor: 'blue',
    },
  ]);
};
go();
