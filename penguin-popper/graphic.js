const dist = (x1, y1, x2, y2) =>
  Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));

const getAngle = (x1, y1, x2, y2) =>
  x2 < x1
    ? Math.atan((y2 - y1) / (x2 - x1)) + 3.1415926536
    : Math.atan((y2 - y1) / (x2 - x1));

const fillPolygon = (ctx, xcoords, ycoords, len) => {
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    ctx.lineTo(xcoords[i], ycoords[i]);
  }
  ctx.fill();
};

const toColor = n =>
  isNaN(n) ? n : '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);

class Poly {
  draw(ctx, xc, yc, scale, angle, flip, vColor) {
    if (this.point.length > 2) {
      let xcoords = [],
        ycoords = [];
      for (let i = 0; i < this.point.length; i++) {
        let d =
            (dist(this.point[i].x, this.point[i].y, 400, 285) / 285) * scale,
          a = getAngle(this.point[i].x, this.point[i].y, 400, 285) + angle;
        xcoords[i] = xc - d * Math.cos(a);
        if (flip) xcoords[i] = 2 * xc - xcoords[i];
        ycoords[i] = yc - d * Math.sin(a);
      }
      if (this.varColor) ctx.fillStyle = toColor(vColor);
      else ctx.fillStyle = toColor(this.color);
      fillPolygon(ctx, xcoords, ycoords, this.point.length);
    }
  }
  inside(x, y) {
    let odd = false;
    if (this.point.length > 2) {
      let j = this.point.length - 1;
      for (let i = 0; i < this.point.length; i++) {
        if (
          (this.point[i].y < y && this.point[j].y >= y) ||
          (this.point[j].y < y && this.point[i].y >= y)
        ) {
          if (
            this.point[i].x +
              ((y - this.point[i].y) / (this.point[j].y - this.point[i].y)) *
                (this.point[j].x - this.point[i].x) <
            x
          )
            odd = !odd;
        }
        j = i;
      }
    }
    return odd;
  }
  scale(scale) {
    for (let i = 0; i < this.point.length; i++) {
      let d = (dist(this.point[i].x, this.point[i].y, 400, 285) / 285) * scale,
        a = getAngle(this.point[i].x, this.point[i].y, 400, 285);
      this.point[i].x = 400 - d * Math.cos(a);
      this.point[i].y = 285 - d * Math.sin(a);
    }
  }
  drawScaled(ctx, xc, yc) {
    let xcoords = [],
      ycoords = [];
    for (let i = 0; i < this.point.length; i++) {
      xcoords[i] = xc - 400 + this.point[i].x;
      ycoords[i] = yc - 285 + this.point[i].y;
    }
    ctx.fillStyle = toColor(this.color);
    fillPolygon(ctx, xcoords, ycoords, this.point.length);
  }
}

export class graphic {
  constructor(input) {
    this.poly = [];
    let polyIndex = 0,
      pointIndex = 0;
    let current = '',
      mode = 'index';
    let x = 0;
    for (let i = 0; i < input.length; i++) {
      if (input.charAt(i) == ' ') {
        if (mode == 'index') {
          this.poly = [];
          mode = 'color';
        } else if (mode == 'color') {
          this.poly[polyIndex] = new Poly();
          if (current.charAt(0) == 'v') this.poly[polyIndex].varColor = true;
          else this.poly[polyIndex].color = current;
          polyIndex++;
          mode = 'points';
        } else if (mode == 'points') {
          this.poly[polyIndex - 1].point = [];
          pointIndex = 0;
          mode = 'x';
        } else if (mode == 'x') {
          x = parseFloat(current);
          mode = 'y';
        } else if (mode == 'y') {
          this.poly[polyIndex - 1].point[pointIndex] = {
            x,
            y: parseFloat(current)
          };
          pointIndex++;
          mode = 'x';
        }
        current = '';
      } else if (input.charAt(i) == ',') {
        mode = 'color';
        current = '';
      } else current += input.charAt(i);
    }
  }
  draw(ctx, xc, yc, scale, angle, flip, vColor) {
    for (let i = 0; i < this.poly.length; i++)
      this.poly[i].draw(ctx, xc, yc, scale, angle, flip, vColor);
  }
  drawScaled(ctx, xc, yc) {
    for (let i = 0; i < this.poly.length; i++)
      this.poly[i].drawScaled(ctx, xc, yc);
  }
  scale(scale) {
    for (let i = 0; i < this.poly.length; i++) this.poly[i].scale(scale);
  }
}
