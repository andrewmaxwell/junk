import {getCamera} from './getCamera.js';
import {getRender} from './getRender.js';
import {getVoxelGeometryUpdater} from './getVoxelGeometryUpdater.js';
import {makeWorld} from './makeWorld.js';
import {getScene} from './getScene.js';
import {addControls} from './addControls.js';
import {getMaterial} from './getMaterial.js';
import {putVoxel} from './putVoxel.js';
import {langton} from './langton.js';

const chunkSize = 32;

const canvas = document.querySelector('#c');
const camera = getCamera({
  x: 50,
  y: 0,
  z: 0,
});
const scene = getScene();
const render = getRender({
  canvas,
  camera,
  scene,
});
const world = makeWorld(chunkSize);
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
  onClick: (event) =>
    putVoxel({event, camera, world, updateVoxelGeometry, render}),
});

langton({
  world,
  updateVoxelGeometry,
  render,
});
