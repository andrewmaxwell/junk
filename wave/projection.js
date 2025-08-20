/**
 * @type {(
 *  cameraX: number,
 *  cameraY: number,
 *  cameraZ: number,
 *  rotationX: number,
 *  rotationY: number,
 *  rotationZ: number,
 *  pointAtX: number,
 *  pointAtY: number,
 *  zoom: number
 * ) => (px: number, py: number, pz: number) => ({
 *  x: number,
 *  y: number,
 *  z: number
 * })}
 * */
export const projection = (
  cameraX,
  cameraY,
  cameraZ,
  rotationX,
  rotationY,
  rotationZ,
  pointAtX,
  pointAtY,
  zoom,
) => {
  const sinx = Math.sin(rotationX);
  const cosx = Math.cos(rotationX);
  const siny = Math.sin(rotationY);
  const cosy = Math.cos(rotationY);
  const sinz = Math.sin(rotationZ);
  const cosz = Math.cos(rotationZ);
  const ra = cosy * cosz;
  const rb = cosy * -sinz;
  const rc = siny;
  const rd = sinx * siny * cosz + cosx * sinz;
  const re = -sinx * siny * sinz + cosx * cosz;
  const rf = -sinx * cosy;
  const rg = cosx * -siny * cosz + sinx * sinz;
  const rh = cosx * siny * sinz + sinx * cosz;
  const ri = cosx * cosy;
  return (px, py, pz) => {
    px -= cameraX;
    py -= cameraY;
    pz -= cameraZ;
    const z = rg * px + rh * py + ri * pz;
    const m = zoom / z;
    return {
      x: m * (ra * px + rb * py + rc * pz - pointAtX),
      y: m * (rd * px + re * py + rf * pz - pointAtY),
      z,
    };
  };
};
