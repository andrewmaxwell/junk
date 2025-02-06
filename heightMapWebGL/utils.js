const perspective = (fovy, aspect, near, far) => {
  const out = new Float32Array(16);
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
};

const lookAt = (eye, center, up) => {
  const out = new Float32Array(16);
  let z0 = eye[0] - center[0],
    z1 = eye[1] - center[1],
    z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2);
  if (len === 0) {
    z2 = 1;
    len = 1;
  }
  z0 /= len;
  z1 /= len;
  z2 /= len;

  let x0 = up[1] * z2 - up[2] * z1,
    x1 = up[2] * z0 - up[0] * z2,
    x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (len !== 0) {
    x0 /= len;
    x1 /= len;
    x2 /= len;
  }

  const y0 = z1 * x2 - z2 * x1,
    y1 = z2 * x0 - z0 * x2,
    y2 = z0 * x1 - z1 * x0;

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
};

const multiply = (a, b) => {
  const out = new Float32Array(16);
  out[0] = a[0] * b[0] + a[4] * b[1] + a[8] * b[2] + a[12] * b[3];
  out[1] = a[1] * b[0] + a[5] * b[1] + a[9] * b[2] + a[13] * b[3];
  out[2] = a[2] * b[0] + a[6] * b[1] + a[10] * b[2] + a[14] * b[3];
  out[3] = a[3] * b[0] + a[7] * b[1] + a[11] * b[2] + a[15] * b[3];
  out[4] = a[0] * b[4] + a[4] * b[5] + a[8] * b[6] + a[12] * b[7];
  out[5] = a[1] * b[4] + a[5] * b[5] + a[9] * b[6] + a[13] * b[7];
  out[6] = a[2] * b[4] + a[6] * b[5] + a[10] * b[6] + a[14] * b[7];
  out[7] = a[3] * b[4] + a[7] * b[5] + a[11] * b[6] + a[15] * b[7];
  out[8] = a[0] * b[8] + a[4] * b[9] + a[8] * b[10] + a[12] * b[11];
  out[9] = a[1] * b[8] + a[5] * b[9] + a[9] * b[10] + a[13] * b[11];
  out[10] = a[2] * b[8] + a[6] * b[9] + a[10] * b[10] + a[14] * b[11];
  out[11] = a[3] * b[8] + a[7] * b[9] + a[11] * b[10] + a[15] * b[11];
  out[12] = a[0] * b[12] + a[4] * b[13] + a[8] * b[14] + a[12] * b[15];
  out[13] = a[1] * b[12] + a[5] * b[13] + a[9] * b[14] + a[13] * b[15];
  out[14] = a[2] * b[12] + a[6] * b[13] + a[10] * b[14] + a[14] * b[15];
  out[15] = a[3] * b[12] + a[7] * b[13] + a[11] * b[14] + a[15] * b[15];
  return out;
};

export const getProjection = (
  {x, y, z, yaw, pitch},
  aspect,
  viewingAngle = Math.PI / 3,
) => {
  const proj = perspective(viewingAngle, aspect, 0.1, 2000);

  const view = lookAt(
    [x, y, z],
    [
      x + Math.sin(yaw) * Math.cos(pitch),
      y + Math.sin(pitch),
      z + Math.cos(yaw) * Math.cos(pitch),
    ],
    [0, 1, 0],
  );

  return multiply(proj, view);
};

export const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = '';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
