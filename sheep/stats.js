export function makeStatCanvas({width, height, stats}) {
  var canvas = document.createElement('canvas');

  function reset() {
    canvas.width = width;
    canvas.height = height;
    canvas.style.background = '#CCC';

    stats.forEach(s => {
      s.min = s.min !== undefined ? s.min : Infinity;
      s.max = s.max !== undefined ? s.max : -Infinity;
      s.vals = [];
      s.data = [];
      s.disp = s.disp || (a => a);
    });
  }

  return {
    canvas,
    reset,
    update(vals) {
      for (var i = 0; i < stats.length; i++) {
        var s = stats[i];
        var val = vals[s.prop];

        if (s.per) {
          s.data.push(val);
          val -= s.data[Math.max(0, s.data.length - s.per)];
        }
        s.min = Math.min(s.min, val);
        s.max = Math.max(s.max, val);
        s.vals.push(val);
      }
    },
    render() {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      for (var i = 0; i < stats.length; i++) {
        var s = stats[i];

        ctx.strokeStyle = ctx.fillStyle = s.color;
        ctx.beginPath();

        var xScale = width / s.vals.length;
        var yScale = height / (s.max - s.min);
        for (var j = 0; j < s.vals.length; j++) {
          ctx.lineTo(j * xScale, height - (s.vals[j] - s.min) * yScale);
        }
        ctx.stroke();

        var val = s.vals[s.vals.length - 1];
        ctx.fillText(
          s.prop + ': ' + s.disp(val) + (s.per ? ' / ' + s.per : ''),
          2,
          2 + (i + 1) * 12
        );
      }
    }
  };
}
