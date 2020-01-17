export class Stats {
  constructor(canvas, lines) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = canvas.getContext('2d');

    lines.forEach(line => {
      // should already have key and color
      line.max = -Infinity;
      line.values = [];
    });
    this.lines = lines;
  }
  update(ob) {
    this.lines.forEach(line => {
      const val = ob[line.key];
      line.values.push(val);
      line.max = Math.max(line.max, val);
    });
  }
  render() {
    const {width, height, ctx, lines} = this;
    ctx.clearRect(0, 0, width, height);

    lines.forEach(({color, values, max}) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      values.forEach((v, i) => {
        ctx.lineTo((i / (values.length - 1)) * width, (1 - v / max) * height);
      });
      ctx.stroke();
    });

    const info = lines
      .map(
        ({key, values, formatter = v => v}) =>
          `${key}: ${formatter(values[values.length - 1])}`
      )
      .join('  ');
    ctx.fillText(info, 2, height - 2);

    // ctx.fillText(
    //   `T: ${solver.temperature.toPrecision(5)}, Min: ${solver.minCost}`,
    //   2,
    //   height - 2
    // );
  }
}
