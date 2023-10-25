import {
  Scene,
  Color,
  DirectionalLight,
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.157.0/three.module.js';

const makeLight = (color, intensity, x, y, z) => {
  const light = new DirectionalLight(color, intensity);
  light.position.set(x, y, z);
  return light;
};

export const getScene = () => {
  const scene = new Scene();
  scene.background = new Color('black');
  scene.add(makeLight(0xffffff, 3, -1, 2, 4));
  scene.add(makeLight(0xffffff, 3, 1, -1, -2));
  return scene;
};
