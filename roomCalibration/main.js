const canvasWidth = 4000;
const canvasHeight = 300;

const resp = await fetch('20250110.json');
const data = await resp.json();
console.log(data);

const resultDiv = document.querySelector('#result');

Object.values(data.detectedChannels).forEach(({commandId, responseData}) => {
  if (!responseData[0]) return;

  const header = document.createElement('h2');
  header.innerText = commandId;
  resultDiv.append(header);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const data = Object.values(responseData).map((arr) => arr.map(Number));
  let min = Infinity;
  let max = -Infinity;
  data.flat().forEach((v) => {
    min = Math.min(min, v);
    max = Math.max(max, v);
  });

  const offset = data.map((arr) => arr.findIndex((v) => v > 0.1));

  data.forEach((arr, i) => {
    ctx.strokeStyle = `hsl(${(i / data.length) * 360}, 100%, 50%)`;
    ctx.beginPath();
    arr.forEach((v, j) => {
      const x =
        Math.sqrt((j - offset[i] + offset[0]) / (arr.length - 1)) * canvasWidth;
      const y = ((v - min) / (max - min)) * canvasHeight;
      ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  resultDiv.append(canvas);
});
