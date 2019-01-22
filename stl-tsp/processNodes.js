import {distance} from './utils.js';

export const processNodes = mapData => {
  const nodes = mapData.nodes.split(';').map((node, i) => {
    const [x, y] = node.split(',');
    return {
      id: i,
      x: x / mapData.width,
      y: y / mapData.width,
      neighbors: [],
      roads: []
    };
  });

  mapData.roads.forEach(road => {
    road.nodes = road.nodes.map(id => nodes[id]);
    road.nodes.forEach(n => {
      n.roads.push(road);
    });
  });

  nodes.forEach(n => {
    n.label = n.roads
      .map(r => `${r.name} (${r.speed})`)
      .unique()
      .join(', ');
    delete n.roads;
  });

  mapData.roads.forEach(road => {
    for (let i = 0; i < road.nodes.length - 1; i++) {
      let a = road.nodes[i];
      let b = road.nodes[i + 1];
      let cost = (distance(a, b) / road.speed) * 60;
      a.neighbors.push({cost, node: b});
      if (!road.oneway) b.neighbors.push({cost, node: a});
    }
  });

  return nodes;
};
