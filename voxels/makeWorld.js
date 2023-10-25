import {VoxelWorld} from './VoxelWorld.js';

// const randInt = (min, max) => Math.floor(Math.random() * (max - min) + min);

export const makeWorld = (chunkSize) => {
  const world = new VoxelWorld({
    chunkSize,
    tileSize: 16,
    tileTextureWidth: 256,
    tileTextureHeight: 64,
  });

  // for (let z = 0; z < chunkSize; ++z) {
  //   for (let x = 0; x < chunkSize; ++x) {
  //     const height =
  //       (Math.sin((x / chunkSize) * Math.PI * 2) +
  //         Math.sin((z / chunkSize) * Math.PI * 3)) *
  //         (chunkSize / 6) +
  //       chunkSize / 2;

  //     for (let y = 0; y < height; ++y) {
  //       world.setVoxel(x, y, z, randInt(1, 17));
  //     }
  //   }
  // }

  return world;
};
