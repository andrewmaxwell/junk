import fs from 'fs';
import xml2js from 'xml2js';

const normalize = (nodes, resolution) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const {x, y} of nodes) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const scale = resolution / Math.max(maxX - minX, maxY - minY);
  return nodes.map(({x, y}) => [
    Math.round((x - minX) * scale),
    Math.round((y - minY) * scale),
  ]);
};

const scale = 20037508.34; // degrees to meters
const mercator = ([lat, lon]) => ({
  x: Math.round((lon * scale) / 180),
  y: Math.round(
    -Math.log(Math.tan((90 + lat) * (Math.PI / 360))) * (scale / Math.PI)
  ),
});

const xml = fs.readFileSync('/Users/andrew/Downloads/map.osm', 'utf8');
const {osm} = await new xml2js.Parser().parseStringPromise(xml);

const nodes = Object.fromEntries(
  osm.node.map((n) => [n.$.id, [+n.$.lat, +n.$.lon]])
);

const coords = [];
const coordIds = {};

const paths = osm.way
  .filter(({tag}) => !tag || tag.some((t) => t.$.k === 'highway'))
  .map(({nd}) =>
    nd.map((n) => {
      const coord = mercator(nodes[n.$.ref]);
      return (coordIds[JSON.stringify(coord)] ??= coords.push(coord) - 1);
    })
  );

fs.writeFileSync(
  'randomWalk/paths.json',
  JSON.stringify({coords: normalize(coords, 1e5), paths})
);
