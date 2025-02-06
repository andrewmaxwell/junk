const heightMult = 400;

export const makeRenderer = () => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let imagedata, buf8, buf32;

  const drawVerticalLine = (x, ytop, ybottom, col) => {
    ytop = Math.max(ytop, 0);
    if (ytop >= ybottom) return;

    const w = canvas.width;
    let offset = ytop * w + x;
    for (let k = ytop; k < ybottom; k++) {
      buf32[offset] = col;
      offset += w;
    }
  };

  const render = (camera, width, height, altitudes, color) => {
    buf32.fill(0xffe09090); // sky color

    const screenWidth = canvas.width;
    const sinAngle = Math.sin(camera.angle);
    const cosAngle = Math.cos(camera.angle);

    const hiddeny = new Int32Array(screenWidth).fill(canvas.height);

    for (let z = 1, dz = 1; z < camera.distance; z += dz, dz += 0.005) {
      let plx = -cosAngle * z - sinAngle * z;
      let ply = sinAngle * z - cosAngle * z;
      const prx = cosAngle * z - sinAngle * z;
      const pry = -sinAngle * z - cosAngle * z;

      const dx = (prx - plx) / screenWidth;
      const dy = (pry - ply) / screenWidth;
      plx += camera.x;
      ply += camera.y;
      const invz = heightMult / z;
      for (let x = 0; x < screenWidth; x++) {
        const mapoffset =
          (Math.floor(ply) & (width - 1)) * width +
          (Math.floor(plx) & (height - 1));
        const heightonscreen =
          ((camera.height - altitudes[mapoffset]) * invz + camera.horizon) | 0;
        drawVerticalLine(x, heightonscreen, hiddeny[x], color[mapoffset]);
        hiddeny[x] = Math.min(hiddeny[x], heightonscreen);
        plx += dx;
        ply += dy;
      }
    }

    const altitude =
      altitudes[
        (Math.floor(camera.y) & (width - 1)) * width +
          (Math.floor(camera.x) & (height - 1))
      ];
    camera.height = Math.max(camera.height, altitude + 10);

    imagedata.data.set(buf8);
    ctx.putImageData(imagedata, 0, 0);
  };

  onresize = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    imagedata = ctx.createImageData(canvas.width, canvas.height);
    const bufarray = new ArrayBuffer(imagedata.width * imagedata.height * 4);
    buf8 = new Uint8Array(bufarray);
    buf32 = new Uint32Array(bufarray);
  };

  onresize();

  return {render};
};
