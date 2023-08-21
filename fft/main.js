const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 1200;

const start = async () => {
  window.removeEventListener('keypress', start);

  const audioContext = new AudioContext();
  const analyzer = audioContext.createAnalyser();
  const num = analyzer.frequencyBinCount;
  const dataArray = new Uint8Array(num);

  canvas.height = num;
  ctx.fillStyle = 'white';

  const stream = await navigator.mediaDevices.getUserMedia({audio: true});
  audioContext.createMediaStreamSource(stream).connect(analyzer);

  let x = 0;
  const loop = () => {
    analyzer.getByteFrequencyData(dataArray);

    ctx.clearRect(x, 0, 1, num);
    for (let i = 0; i < num; i++) {
      ctx.globalAlpha = dataArray[i] / 255;
      ctx.fillRect(x, i, 1, 1);
    }
    x = (x + 1) % canvas.width;
    requestAnimationFrame(loop);
  };

  loop();
};

window.addEventListener('keypress', start);

ctx.fillStyle = 'white';
ctx.font = '32px sans-serif';
ctx.fillText('Press any key to start.', 100, 100);
