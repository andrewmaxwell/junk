import {World3D} from './World3D.js';

const worldWidth = 2400;
const worldHeight = 600;
const minLen = 50;
const maxLen = worldHeight;

export const makeWorld = (data) => {
  const world = new World3D({
    width: worldWidth,
    height: worldHeight,
    depth: worldWidth,
  });

  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    d.p = world.addPoint(
      worldHeight * (Math.random() - 0.5),
      worldHeight * (Math.random() - 0.5),
      worldHeight * (Math.random() - 0.5)
    );
    d.p.name = d.name;
    const scores = Object.values(d.scores);
    min = Math.min(min, ...scores);
    max = Math.max(max, ...scores);
  }

  for (let i = 1; i < data.length; i++) {
    for (let j = 0; j < i; j++) {
      world.link(
        data[i].p,
        data[j].p,
        minLen +
          (maxLen - minLen) *
            ((data[i].scores[data[j].name] - min) / (max - min))
      );
    }
  }
  return world;
};
