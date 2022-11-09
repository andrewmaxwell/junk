const {sin, cos} = Math;

class Renderer {
  constructor(width, height, distanceFromCam = 100, viewingAngle = 40) {
    this.width = width;
    this.height = height;
    this.zBuffer = new Array(width * height);
    this.buffer = new Array(width * height);
    this.distanceFromCam = distanceFromCam;
    this.viewingAngle = viewingAngle;
  }
  clear() {
    this.buffer.fill(' ');
    this.zBuffer.fill(0);
  }
  surface(sx, sy, sz, {A, B, C}, char, offset) {
    const {width, height, distanceFromCam, viewingAngle, zBuffer, buffer} =
      this;

    const x =
      sy * sin(A) * sin(B) * cos(C) -
      sz * cos(A) * sin(B) * cos(C) +
      sy * cos(A) * sin(C) +
      sz * sin(A) * sin(C) +
      sx * cos(B) * cos(C);

    const y =
      sy * cos(A) * cos(C) +
      sz * sin(A) * cos(C) -
      sy * sin(A) * sin(B) * sin(C) +
      sz * cos(A) * sin(B) * sin(C) -
      sx * cos(B) * sin(C);

    const z =
      sz * cos(A) * cos(B) -
      sy * sin(A) * cos(B) +
      sx * sin(B) +
      distanceFromCam;

    const ooz = 1 / z;

    const xp = Math.floor(width / 2 + offset.x + viewingAngle * ooz * x * 2);
    const yp = Math.floor(height / 2 + offset.y + viewingAngle * ooz * y);

    const idx = xp + yp * width;
    if (xp >= 0 && xp < width && yp >= 0 && yp < height && ooz > zBuffer[idx]) {
      zBuffer[idx] = ooz;
      buffer[idx] = char;
    }
  }
  renderCube(halfWidth, offset, rotation) {
    for (let x = -halfWidth; x <= halfWidth; x++) {
      for (let y = -halfWidth; y <= halfWidth; y++) {
        this.surface(x, y, -halfWidth, rotation, '@', offset);
        this.surface(halfWidth, y, x, rotation, '$', offset);
        this.surface(-halfWidth, y, -x, rotation, '~', offset);
        this.surface(-x, y, halfWidth, rotation, '#', offset);
        this.surface(x, -halfWidth, -y, rotation, ';', offset);
        this.surface(x, halfWidth, y, rotation, '+', offset);
      }
    }
  }
  toString() {
    const {width, height, buffer} = this;
    const rows = [];
    for (let i = 0; i < height; i++) {
      rows[i] = buffer.slice(i * width, (i + 1) * width).join('');
    }
    return rows.join('\n');
  }
}

const renderer = new Renderer(160, 44);
const rotation = {A: 0, B: 0, C: 0};
const output = document.querySelector('pre');

const loop = () => {
  renderer.clear();
  renderer.renderCube(20, {x: -40, y: 0}, rotation);
  renderer.renderCube(10, {x: 10, y: 0}, {...rotation, B: -rotation.B});
  renderer.renderCube(5, {x: 40, y: 0}, {...rotation, C: -rotation.C});

  rotation.A += 0.05;
  rotation.B += 0.05;
  rotation.C += 0.01;

  output.innerText = renderer.toString();

  requestAnimationFrame(loop);
};

loop();
