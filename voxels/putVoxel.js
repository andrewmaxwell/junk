import {Vector3} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.157.0/three.module.js';

const getRayIntersection = (camera, world, {clientX, clientY}) => {
  const x = (clientX / innerWidth) * 2 - 1;
  const y = (clientY / innerHeight) * -2 + 1; // note we flip Y

  const start = new Vector3();
  start.setFromMatrixPosition(camera.matrixWorld);

  const end = new Vector3();
  end.set(x, y, 1).unproject(camera);

  return world.intersectRay(start, end);
};

let voxelTypeIndex = 1;

export const putVoxel = ({
  event,
  camera,
  world,
  updateVoxelGeometry,
  render,
}) => {
  const intersection = getRayIntersection(camera, world, event);
  if (intersection) {
    const voxelId = event.shiftKey ? 0 : voxelTypeIndex;
    // the intersection point is on the face. That means the math imprecision could put us on either side of the face.
    // so go half a normal into the voxel if removing (currentVoxel = 0) or out of the voxel if adding (currentVoxel  > 0)
    const [x, y, z] = intersection.position.map(
      (v, i) => v + intersection.normal[i] * (voxelId > 0 ? 0.5 : -0.5)
    );
    world.setVoxel(x, y, z, voxelId);
    updateVoxelGeometry([{x, y, z}]);
    render();
  }
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') voxelTypeIndex = (voxelTypeIndex + 1) % 16;
});
