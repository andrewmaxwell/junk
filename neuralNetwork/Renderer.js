const nodeRad = 12;
const weightWidth = 0.25;

const getX = (x) => 50 + x * (innerWidth - 100);
const getY = (y) => 50 + (isNaN(y) ? 0.5 : y) * (innerHeight - 100);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }
  drawErrorRate(errorRates) {
    const {ctx} = this;
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.moveTo(0, innerHeight);
    for (let i = 0; i < errorRates.length; i++) {
      const x = innerWidth * (i / (errorRates.length - 1));
      const y = innerHeight * errorRates[i];
      ctx.lineTo(x, y);
    }
    ctx.lineTo(innerWidth, innerHeight);
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.font = '20px sans-serif';
    const lastValue = errorRates[errorRates.length - 1];
    ctx.fillText(
      `Accuracy: ${((1 - lastValue) * 100).toFixed()}%`,
      5,
      innerHeight - 10
    );
  }
  drawNeurons(layers) {
    const {ctx} = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '10px sans-serif';
    for (let i = 0; i < layers.length; i++) {
      const {biases, values} = layers[i];
      const x = getX(i / (layers.length - 1));
      for (let j = 0; j < values.length; j++) {
        const y = getY(j / (values.length - 1));

        ctx.fillStyle = biases
          ? `hsl(${biases[j] < 0 ? 0 : 240}, ${Math.abs(biases[j] * 20)}%, 50%)`
          : 'gray';

        ctx.beginPath();
        ctx.arc(x, y, nodeRad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.fillText(Math.round(values[j] * 100), x, y);
      }
    }
  }
  drawConnections(layers) {
    const {ctx} = this;
    ctx.lineCap = 'round';
    for (let i = 1; i < layers.length; i++) {
      const {weights} = layers[i];
      const x1 = getX(i / (layers.length - 1));
      const x2 = getX((i - 1) / (layers.length - 1));
      for (let j = 0; j < weights.length; j++) {
        const y1 = getY(j / (weights.length - 1));
        for (let k = 0; k < weights[j].length; k++) {
          const y2 = getY(k / (weights[0].length - 1));
          const weight = weights[j][k];
          ctx.strokeStyle = weight < 0 ? 'red' : 'blue';
          ctx.lineWidth = Math.abs(weight * weightWidth);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }
  }
  drawTime(time) {
    const {ctx} = this;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'black';
    ctx.fillText(time.toLocaleString() + 'ms', 3, 3);
  }
  render({layers}, errorRates, time) {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
    this.drawErrorRate(errorRates);
    this.drawConnections(layers);
    this.drawNeurons(layers);
    this.drawTime(time);
  }
}
