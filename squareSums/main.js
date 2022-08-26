const draw = (num) => {
  const canvas = document.querySelector('canvas');
  const W = (canvas.width = innerWidth);
  const H = (canvas.height = innerHeight);
  const T = canvas.getContext('2d');

  T.textAlign = 'center';
  T.textBaseline = 'middle';

  const nums = [];
  for (let i = 1; i <= num; i++) {
    const angle = ((i - 1) / num) * 2 * Math.PI;
    const rad = H / 2 - 30;
    const x = W / 2 + rad * Math.cos(angle);
    const y = H / 2 + rad * Math.sin(angle);
    nums[i] = {x, y};

    T.fillText(i, x + 10 * Math.cos(angle), y + 10 * Math.sin(angle));
  }

  T.beginPath();
  for (let i = 1; i <= num; i++) {
    const n = nums[i];
    // 3, 8, 15, 31
    for (let root = 2; root * root <= i * 2; root++) {
      const p = nums[root * root - i];
      if (p) {
        T.moveTo(n.x, n.y);
        T.lineTo(p.x, p.y);
      }
    }
  }
  T.stroke();
};

let n = 28;
window.addEventListener('click', () => draw(++n));
draw(n);
// setInterval(() => draw(n++), 100);
