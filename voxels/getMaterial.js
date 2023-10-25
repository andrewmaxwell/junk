import {
  TextureLoader,
  NearestFilter,
  SRGBColorSpace,
  MeshLambertMaterial,
  DoubleSide,
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.157.0/three.module.js';

export const getMaterial = (onLoad) => {
  const texture = new TextureLoader().load('flourish-cc-by-nc-sa.png', onLoad);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;

  return new MeshLambertMaterial({
    map: texture,
    side: DoubleSide,
    alphaTest: 0.1,
    transparent: true,
  });
};
