export const projection = (clx, cly, clz, crx, cry, crz, vx, vy, vz) => {
  const sinx = Math.sin(crx);
  const cosx = Math.cos(crx);
  const siny = Math.sin(cry);
  const cosy = Math.cos(cry);
  const sinz = Math.sin(crz);
  const cosz = Math.cos(crz);
  const ra = cosy * cosz;
  const rb = cosy * -sinz;
  const rc = siny;
  const rd = -sinx * -siny * cosz + cosx * sinz;
  const re = -sinx * -siny * -sinz + cosx * cosz;
  const rf = -sinx * cosy;
  const rg = cosx * -siny * cosz + sinx * sinz;
  const rh = cosx * -siny * -sinz + sinx * cosz;
  const ri = cosx * cosy;
  return (px, py, pz) => {
    px -= clx;
    py -= cly;
    pz -= clz;
    const z = rg * px + rh * py + ri * pz;
    return {
      x: (vz / z) * (ra * px + rb * py + rc * pz - vx),
      y: (vz / z) * (rd * px + re * py + rf * pz - vy),
      z,
    };
  };
};
