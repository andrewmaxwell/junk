const {Papa, Chart} = window;

// const rollingAvg = (data, duration) => {
//   let amt = 0;
//   let index = 0;
//   return data.map((el) => {
//     while (el.x - data[index].x > duration) {
//       amt -= data[index].y;
//       index++;
//     }
//     amt += el.y;
//     return {...el, _y: el.y, y: Math.round(amt * 100) / 100};
//   });
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

// const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
// const getStats = (arr) => {
//   const m = mean(arr);
//   return {mean: m, stdDev: Math.sqrt(mean(arr.map((v) => (v - m) ** 2)))};
// };

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
    .filter(({estimate, assignees}) => Number(estimate) && assignees)
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

  // const numSprints = 3;
  // makeChart(
  //   'line',
  //   '8 Week Average Velocity',
  //   rollingAvg(
  //     workOverTime.map((e) => ({...e, y: Number(e.estimate) / numSprints})),
  //     numSprints * 14 * 24 * 3600 * 1000
  //   )
  // );

  makeChart(
    'Time to Complete Stories',
    Object.entries(groupBy((t) => t.estimate, workOverTime))
      .filter(([, arr]) => arr.length > 5)
      .sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([points, items]) => {
        const vals = items
          .map((e) => ({...e, y: Number(e.days), r: 5}))
          .filter(({y}) => y < 50);
        // const {mean, stdDev} = getStats(vals.map((p) => p.y));

        return [
          {
            label: `${points} point`,
            type: 'bubble',
            data: vals,
            backgroundColor: `rgba(${colors[points]},0.25)`,
          },
          {
            label: `${points} point Bezier`,
            type: 'line',
            data: bezier(vals),
            fill: false,
            borderColor: `rgb(${colors[points]})`,
          },
        ];
      })
  );
};
go();
