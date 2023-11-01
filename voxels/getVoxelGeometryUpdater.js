import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.157.0/three.module.js';

const neighborOffsets = [
  [0, 0, 0], // self
  [-1, 0, 0], // left
  [1, 0, 0], // right
  [0, -1, 0], // down
  [0, 1, 0], // up
  [0, 0, -1], // back
  [0, 0, 1], // front
];

export const getVoxelGeometryUpdater = ({
  material,
  chunkSize,
  world,
  scene,
}) => {
  const chunkIdToMesh = {};
  function updateChunkGeometry(x, y, z) {
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);
    const chunkId = world.computeChunkId(x, y, z);
    let mesh = chunkIdToMesh[chunkId];
    const geometry = mesh ? mesh.geometry : new BufferGeometry();

    const {positions, normals, uvs, indices} =
      world.generateGeometryDataForChunk(chunkX, chunkY, chunkZ);
    const positionNumComponents = 3;
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), positionNumComponents)
    );
    const normalNumComponents = 3;
    geometry.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(normals), normalNumComponents)
    );
    const uvNumComponents = 2;
    geometry.setAttribute(
      'uv',
      new BufferAttribute(new Float32Array(uvs), uvNumComponents)
    );
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    if (!mesh) {
      mesh = new Mesh(geometry, material);
      mesh.name = chunkId;
      chunkIdToMesh[chunkId] = mesh;
      scene.add(mesh);
      mesh.position.set(
        chunkX * chunkSize,
        chunkY * chunkSize,
        chunkZ * chunkSize
      );
    }
  }

  const updateVoxelGeometry = (coords) => {
    const updatedChunkIds = {};
    for (const {x, y, z} of coords) {
      for (const [a, b, c] of neighborOffsets) {
        const ox = x + a;
        const oy = y + b;
        const oz = z + c;
        const chunkId = world.computeChunkId(ox, oy, oz);
        if (!updatedChunkIds[chunkId]) {
          // console.log('chunkId', chunkId);
          // console.log('update chunk');
          updatedChunkIds[chunkId] = true;
          updateChunkGeometry(ox, oy, oz);
        }
      }
    }
  };

  updateVoxelGeometry([{x: 1, y: 1, z: 1}]);

  return updateVoxelGeometry;
};
