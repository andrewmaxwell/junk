const turnSpeed = 0.03;
const moveSpeed = 3;

export const makeCamera = () => {
  const camera = {
    x: 0,
    y: 0,
    angle: 0,
    height: 150,
    horizon: 100,
    distance: 1200,
  };

  const pressing = {};

  camera.move = () => {
    if (pressing.a) camera.angle += turnSpeed;
    if (pressing.d) camera.angle -= turnSpeed;
    if (pressing.w) {
      camera.x -= moveSpeed * Math.sin(camera.angle);
      camera.y -= moveSpeed * Math.cos(camera.angle);
    }
    if (pressing.s) {
      camera.x += moveSpeed * Math.sin(camera.angle);
      camera.y += moveSpeed * Math.cos(camera.angle);
    }
    if (pressing.r) camera.height += moveSpeed;
    if (pressing.f) camera.height -= moveSpeed;
    if (pressing.q) camera.horizon += moveSpeed;
    if (pressing.e) camera.horizon -= moveSpeed;
  };

  onkeyup = onkeydown = (e) => (pressing[e.key] = e.type === 'keydown');

  return camera;
};
