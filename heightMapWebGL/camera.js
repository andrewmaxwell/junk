const moveSpeed = 2;
const turnSpeed = 0.002;

export const makeCamera = () => {
  const camera = {x: 60, y: 142, z: -426, yaw: -0.6, pitch: -0.7};

  const pressing = {};
  onkeydown = onkeyup = (e) => (pressing[e.key] = e.type === 'keydown');
  onmousemove = (e) => {
    camera.yaw -= e.movementX * turnSpeed;
    camera.pitch -= e.movementY * turnSpeed;
    camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.pitch));
  };

  camera.move = () => {
    if (pressing.w) {
      camera.x += Math.sin(camera.yaw) * moveSpeed;
      camera.z += Math.cos(camera.yaw) * moveSpeed;
    }
    if (pressing.s) {
      camera.x -= Math.sin(camera.yaw) * moveSpeed;
      camera.z -= Math.cos(camera.yaw) * moveSpeed;
    }
    if (pressing.a) {
      camera.x += Math.cos(camera.yaw) * moveSpeed;
      camera.z += -Math.sin(camera.yaw) * moveSpeed;
    }
    if (pressing.d) {
      camera.x -= Math.cos(camera.yaw) * moveSpeed;
      camera.z -= -Math.sin(camera.yaw) * moveSpeed;
    }
    if (pressing.r) {
      camera.y += moveSpeed;
    }
    if (pressing.f) {
      camera.y -= moveSpeed;
    }
  };

  return camera;
};
