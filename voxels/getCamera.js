import {PerspectiveCamera} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.157.0/three.module.js';

export const getCamera = ({x, y, z}) => {
  const camera = new PerspectiveCamera(75, 2, 0.1, 1000); // fov, aspect, near, far
  camera.position.set(x, y, z);
  return camera;
};
