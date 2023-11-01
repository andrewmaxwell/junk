const voxelType = 1;

const neighbors = [];
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      if (x || y || z) neighbors.push([x, y, z]);
    }
  }
}

const toKey = (x, y, z) => `${x},${y},${z}`;

export const gol = ({world, updateVoxelGeometry, render}) => {
  let grid = {},
    first = true;

  const iterate = () => {
    const changedVoxels = [];

    if (first) {
      first = true;
      const rad = 2;
      for (let x = -rad; x <= rad; x++) {
        for (let y = -rad; y <= rad; y++) {
          for (let z = -rad; z <= rad; z++) {
            if (Math.random() > 0.15) continue;
            grid[toKey(x, y, z)] = 1;
            changedVoxels.push({x, y, z});
            world.setVoxel(x, y, z, voxelType);
          }
        }
      }
    }

    const grid2 = {};
    const nCounts = {};

    for (const key in grid) {
      nCounts[key] = nCounts[key] || 0;
      const [x, y, z] = key.split(',');
      for (const [dx, dy, dz] of neighbors) {
        const nKey = toKey(+x + dx, +y + dy, +z + dz);
        nCounts[nKey] = (nCounts[nKey] || 0) + 1;
      }
    }

    for (const key in nCounts) {
      const n = nCounts[key];
      if (n === 3 || (grid[key] && n === 2)) grid2[key] = 1;

      if ((grid[key] || 0) !== (grid2[key] || 0)) {
        const [x, y, z] = key.split(',').map(Number);
        changedVoxels.push({x, y, z});
        world.setVoxel(x, y, z, grid2[key] ? voxelType : 0);
      }
    }

    grid = grid2;
    console.log('total voxels', Object.keys(grid).length);

    updateVoxelGeometry(changedVoxels);
    render();
  };

  iterate();

  window.addEventListener('keydown', iterate);
};
