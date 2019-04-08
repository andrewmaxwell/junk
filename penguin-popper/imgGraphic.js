import {graphic} from './graphic.js';

export class imgGraphic {
  constructor(z, st, en, fr, colors, downShift, s) {
    this.size = z;
    this.start = st;
    this.end = en;
    this.frames = fr;
    this.img = [];
    for (let color = 0; color < colors.length; color++) {
      this.img[color] = [];
      for (let frame = 0; frame < this.frames + 1; frame++) {
        let canvas = document.createElement('canvas');
        canvas.width = canvas.height = 100;
        let ctx = canvas.getContext('2d');
        new graphic(s).draw(
          ctx,
          50,
          50 * (1 + downShift),
          50,
          this.start + (frame * (this.end - this.start)) / this.frames,
          false,
          colors[color]
        );
        this.img[color][frame] = canvas;
        // document.body.append(canvas);
      }
    }
  }
  draw(ctx, xc, yc, angle, vColor) {
    ctx.drawImage(
      this.img[Math.floor(vColor)][
        Math.floor(
          (((angle % (2 * Math.PI)) - this.start) / (this.end - this.start)) *
            this.frames
        )
      ],
      Math.round(xc - this.size / 2),
      Math.round(yc - this.size / 2)
    );
  }
}
