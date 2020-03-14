const draw = () => {
  localStorage.input = window.input.value;
  const [pointRow, ...rows] = window.input.value
    .trim()
    .split('\n')
    .map(r => r.trim().split(/\s*,\s*/));

  const points = pointRow.map(Number);
  const data = rows.map(([name, color, ...nums]) => ({
    name,
    color,
    nums: nums.map(Number)
  }));

  const maxHours = Math.max(...data.map(d => d.nums[d.nums.length - 1]));
  const maxPoints = points[points.length - 1] + 0.5;

  const {canvas} = window;
  const width = (canvas.width = innerWidth);
  const height = (canvas.height = innerHeight);
  const ctx = canvas.getContext('2d');

  const getX = hours => (hours / maxHours) * width;
  const getY = i => (1 - points[i] / maxPoints) * height;

  ctx.fillStyle = ctx.strokeStyle = 'white';
  ctx.font = '14px sans-serif';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  points.forEach((pt, i) => {
    const y = getY(i);
    ctx.fillText(`${pt} point${pt > 1 ? 's' : ''}`, 5, y + 3);

    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  });

  for (let i = 0; i < maxHours; i += 8) {
    const x = getX(i);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.fillText(i + ' hrs', x + 5, 20);
  }
  ctx.stroke();

  ctx.lineWidth = 1;
  data.forEach(({name, color, nums}, personIndex) => {
    const coords = nums.map((hours, i) => ({
      x: getX(hours),
      y: getY(i)
    }));

    ctx.fillStyle = ctx.strokeStyle = color;

    coords.forEach(({x, y}) => {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.beginPath();
    coords.forEach(({x, y}) => {
      ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.save();
    ctx.translate(width - 200, height - 200 + personIndex * 25);
    ctx.fillRect(0, 0, 20, 20);
    ctx.fillStyle = 'white';
    ctx.fillText(name, 30, 4);
    ctx.restore();
  });
};

if (localStorage.input) window.input.value = localStorage.input;
window.addEventListener('resize', draw);
window.input.addEventListener('input', draw);
draw();
