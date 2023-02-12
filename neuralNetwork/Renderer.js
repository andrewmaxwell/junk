const nodeRad = 12;
const weightWidth = 0.5;

const getX = (x) => 50 + x * (innerWidth - 100);
const getY = (y) => 50 + (isNaN(y) ? 0.5 : y) * (innerHeight - 100);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }
  drawNeurons(layers) {
    const {ctx} = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < layers.length; i++) {
      const {neurons} = layers[i];
      const x = getX(i / (layers.length - 1));
      for (let j = 0; j < neurons.length; j++) {
        const y = getY(j / (neurons.length - 1));
        const {bias, value} = neurons[j];

        ctx.fillStyle = `hsl(${bias < 0 ? 0 : 240}, ${Math.abs(
          bias * 20
        )}%, 50%)`;

        ctx.beginPath();
        ctx.arc(x, y, nodeRad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.fillText(value.toLocaleString(), x, y);
      }
    }
  }
  drawConnections(layers) {
    const {ctx} = this;
    ctx.lineCap = 'round';
    for (let i = 0; i < layers.length; i++) {
      const {neurons} = layers[i];
      const x1 = getX(i / (layers.length - 1));
      const x2 = getX((i + 1) / (layers.length - 1));
      for (let j = 0; j < neurons.length; j++) {
        const y1 = getY(j / (neurons.length - 1));
        const {outputs} = neurons[j];
        for (let k = 0; k < outputs.length; k++) {
          const y2 = getY(k / (outputs.length - 1));
          const weight = outputs[k].weight;
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
  render({layers}) {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
    this.drawConnections(layers);
    this.drawNeurons(layers);
  }
}
