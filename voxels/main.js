// https://threejs.org/manual/examples/voxel-geometry-culled-faces-ui.html

import {getCamera} from './getCamera.js';
import {getRender} from './getRender.js';
import {getVoxelGeometryUpdater} from './getVoxelGeometryUpdater.js';
import {getScene} from './getScene.js';
import {addControls} from './addControls.js';
import {getMaterial} from './getMaterial.js';
// import {putVoxel} from './putVoxel.js';
import {VoxelWorld} from './VoxelWorld.js';
import {langton} from './langton.js';

const chunkSize = 32; // a chunk is 32x32x32 voxels
const canvas = document.querySelector('#c');
const camera = getCamera({x: 20, y: 0, z: 0});
const scene = getScene();
const render = getRender({canvas, camera, scene});

const world = new VoxelWorld({
  chunkSize,
  tileSize: 16,
  tileTextureWidth: 256,
  tileTextureHeight: 64,
});

const updateVoxelGeometry = getVoxelGeometryUpdater({
  material: getMaterial(render),
  chunkSize,
  world,
  scene,
});

addControls({
  camera,
  canvas,
  render,
  x: 0,
  y: 0,
  z: 0,
  // onClick: (event) =>
  //   putVoxel({event, camera, world, updateVoxelGeometry, render}),
});

langton({world, updateVoxelGeometry, render});
