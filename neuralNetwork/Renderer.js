const nodeRad = 8;
const weightWidth = 0.5;

const getX = (x) => 50 + x * 200;
const getY = (y) => 50 + (isNaN(y) ? 0.5 : y) * 500;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }
  drawNodes(layers) {
    const {ctx} = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'black';
    for (let i = 0; i < layers.length; i++) {
      const x1 = getX(i);
      for (let j = 0; j < layers[i].length; j++) {
        const y1 = getY(j / (layers[i].length - 1));
        const {bias} = layers[i][j];

        ctx.fillStyle = `hsl(${bias < 0 ? 0 : 240}, ${Math.abs(
          bias * 20
        )}%, 50%)`;

        ctx.beginPath();
        ctx.arc(x1, y1, nodeRad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  drawConnections(layers) {
    const {ctx} = this;
    ctx.lineCap = 'round';
    for (let i = 0; i < layers.length; i++) {
      const x1 = getX(i);
      const x2 = getX(i + 1);
      for (let j = 0; j < layers[i].length; j++) {
        const y1 = getY(j / (layers[i].length - 1));
        const {outputs} = layers[i][j];
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
    this.drawNodes(layers);
  }
}
