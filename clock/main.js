'use strict';

const canvas = document.querySelector('canvas');
const S = (canvas.width = canvas.height = 600);
const T = canvas.getContext('2d');

T.textAlign = 'center';

const z = [
  [30, 7, 190],
  [26, 24, 230],
  [20, 60, 260],
  [14, 60, 280]
];
const y = 'Sun Mon Tues Wednes Thurs Fri Satur'.split(' ');

const loop = () => {
  T.clearRect(0, 0, S, S);
  const d = new Date(),
    l = (d % 1e3) / 1e3,
    s = d.getSeconds() + l,
    m = d.getMinutes() + s / 60,
    h = d.getHours() + m / 60,
    w = d.getDay() + h / 24;
  for (let i = 0; i < 4; i++) {
    T.font = z[i][0] + 'px Georgia';
    T.save();
    T.translate(S / 2, S / 2);
    T.rotate(
      (-Math.PI * 2 * (i ? (i == 3 ? s : i == 2 ? m : h) : w)) / z[i][1]
    );
    for (let n = 0; n < z[i][1]; n++) {
      T.fillText(
        i
          ? i == 1
            ? n == 0
              ? '12a'
              : n == 12
              ? '12p'
              : n > 12
              ? n - 12 + 'p'
              : n + 'a'
            : n
          : y[n] + 'day',
        0,
        -z[i][2]
      );
      T.rotate((Math.PI * 2) / z[i][1]);
    }
    T.restore();
  }
  T.lineWidth = 0.5;
  T.beginPath();
  T.moveTo(S / 2, S / 2);
  T.lineTo(S / 2, 0);
  T.stroke();
  requestAnimationFrame(loop);
};
loop();
