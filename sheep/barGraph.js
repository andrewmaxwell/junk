export const makeBarGraph = ({width, height, cols}) => {
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.background = '#CCC';

  var ctx = canvas.getContext('2d');

  return {
    canvas,
    render(items) {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.scale(width / items.length / cols.length, -height);
      ctx.translate(0, -1);

      for (var i = 0; i < cols.length; i++) {
        ctx.fillStyle = cols[i].color;
        ctx.beginPath();
        for (var j = 0; j < items.length; j++) {
          ctx.rect(j * cols.length + i, 0, 1, items[j][cols[i].prop]);
        }
        ctx.fill();
      }

      ctx.restore();
    }
  };
};
