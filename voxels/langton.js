const speed = 10;

const turns = [1, 5, 2, 4];

const dirs = [
  (a) => a.x--, // right
  (a) => a.y--, // up
  (a) => a.z--, // backward
  (a) => a.x++, // left
  (a) => a.y++, // down
  (a) => a.z++, // forward
];

const toKey = ({x, y, z}) => `${x},${y},${z}`;

export const langton = ({world, updateVoxelGeometry, render}) => {
  let grid, ant;

  const reset = () => {
    grid = {};
    ant = {dir: 0, x: 0, y: 0, z: 0};
  };

  const loop = () => {
    if (document.hasFocus()) {
      const changedVoxels = [];

      for (let i = 0; i < speed; ++i) {
        const key = toKey(ant);

        // change dir
        const val = grid[key] || 0;
        ant.dir = (ant.dir + turns[val]) % dirs.length;

        // move ant
        dirs[ant.dir](ant);

        // toggle cell
        grid[key] = (val + 1) % turns.length;

        world.setVoxel(ant.x, ant.y, ant.z, grid[key]);
        changedVoxels.push({...ant});
      }

      updateVoxelGeometry(changedVoxels);
      render();
    }

    requestAnimationFrame(loop);
  };

  reset();
  loop();
};
