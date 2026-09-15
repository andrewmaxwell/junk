// Catalogue of item shapes and container shapes.
//
// Item shapes are unit-sized: polygons have side length 1, the circle has
// diameter 1. Every descriptor carries its own `area` and bounding `radius`
// so nothing downstream needs a hard-coded lookup table.
//
// Container shapes are normalised to *unit area*, so a container built at
// `scale` always has area exactly scale*scale regardless of its shape. That
// makes `scale` directly comparable across containers, and makes the packing
// efficiency simply (total item area) / scale^2.

import { SPHERE_R0 } from './sphere.js';
import {
  shoelaceArea,
  regularPolygonVerts,
  rectVerts,
  polygonInertia,
  supportPoint,
  worldVerts,
} from './geometry.js';

// Items behave as unit-density rigid bodies during relaxation, so each shape
// carries the inverse mass and inverse moment of inertia the contact solver
// needs to split a correction between translation and rotation.
function polygonItem(name, sides) {
  const circumradius = 1 / (2 * Math.sin(Math.PI / sides));
  const verts = regularPolygonVerts(sides, circumradius);
  const area = shoelaceArea(verts);
  return {
    type: 'polygon',
    name,
    sides,
    verts,
    radius: circumradius,
    area,
    invMass: 1 / area,
    invInertia: 1 / polygonInertia(verts, area),
    // A regular k-gon with even k has k/2 distinct edge normals.
    axisCount: sides % 2 === 0 ? sides / 2 : sides,
  };
}

function circleItem(name) {
  const radius = 0.5;
  const area = Math.PI * radius * radius;
  return {
    type: 'circle',
    name,
    verts: null,
    radius,
    area,
    invMass: 1 / area,
    // Disc about its centre: m r^2 / 2. Contacts are radial so this never
    // actually produces torque, but keeping it finite keeps the maths uniform.
    invInertia: 1 / ((area * radius * radius) / 2),
  };
}

export const ITEM_SHAPES = {
  triangle: polygonItem('Triangle', 3),
  square: polygonItem('Square', 4),
  pentagon: polygonItem('Pentagon', 5),
  hexagon: polygonItem('Hexagon', 6),
  circle: circleItem('Circle'),
};

// Build a convex container from counter-clockwise vertices, precomputing the
// outward half-plane for each edge: a point p is inside iff p.n <= d for all.
function convexContainer(verts) {
  const planes = verts.map((v, i) => {
    const [x1, y1] = v;
    const [x2, y2] = verts[(i + 1) % verts.length];
    let nx = y2 - y1;
    let ny = -(x2 - x1);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    return { nx, ny, d: nx * x1 + ny * y1 };
  });
  return { type: 'convex', verts, planes, area: shoelaceArea(verts) };
}

// Circumradius of a regular k-gon whose area is exactly 1.
function unitAreaCircumradius(sides) {
  return Math.sqrt(2 / (sides * Math.sin((2 * Math.PI) / sides)));
}

function regularContainer(name, sides) {
  const r0 = unitAreaCircumradius(sides);
  return {
    name,
    usesAspect: false,
    build: (scale) => convexContainer(regularPolygonVerts(sides, scale * r0, Math.PI / 2)),
  };
}

const CIRCLE_R0 = 1 / Math.sqrt(Math.PI);

export const CONTAINER_SHAPES = {
  circle: {
    name: 'Circle',
    usesAspect: false,
    build: (scale) => ({ type: 'circle', R: scale * CIRCLE_R0, area: scale * scale }),
  },
  rect: {
    name: 'Rectangle',
    usesAspect: true,
    build: (scale, aspect) => {
      const a = Math.sqrt(aspect);
      return convexContainer(rectVerts((scale * a) / 2, scale / (2 * a)));
    },
  },
  triangle: regularContainer('Triangle', 3),
  hexagon: regularContainer('Hexagon', 6),
  // The one curved-space container: items live *on* the surface rather than
  // inside an outline, as spherical caps and regular spherical polygons.
  // Normalised to unit area like the rest -- here that is surface area.
  sphere: {
    name: 'Sphere (surface)',
    usesAspect: false,
    space: 'sphere',
    build: (scale) => ({ type: 'sphere', R: scale * SPHERE_R0, area: scale * scale }),
  },
};

// Half-extent used to frame a flat container on screen.
export function containerRadius(container) {
  if (container.type === 'circle') return container.R;
  let m = 0;
  for (const [x, y] of container.verts) m = Math.max(m, Math.abs(x), Math.abs(y));
  return m;
}

// Scratch vector for support-point queries; `containerContacts` copies out of it
// immediately, avoiding an extra temporary vector per support query.
const SCRATCH = [0, 0];

// The vertex of `verts` furthest from the origin, and that distance.
function farthestVertex(verts) {
  let d = 0;
  let x = 0;
  let y = 0;
  for (const [vx, vy] of verts) {
    const dv = Math.hypot(vx, vy);
    if (dv > d) {
      d = dv;
      x = vx;
      y = vy;
    }
  }
  return { d, x, y };
}

// How far an item (with world `verts`, or null for a circle) pokes through one
// half-plane of a convex container. Negative when it is clear of that wall.
function planeExcess(item, verts, p) {
  if (!verts) return item.x * p.nx + item.y * p.ny + item.shape.radius - p.d;
  let m = -Infinity;
  for (const [x, y] of verts) {
    const v = x * p.nx + y * p.ny;
    if (v > m) m = v;
  }
  return m - p.d;
}

// Contacts between an item and the container wall it is poking through.
//
// Each contact is {nx, ny, ex, px, py}: an outward wall normal, how far the
// item sticks out along it, and where. Results are appended to `out` (which the
// caller clears); the list is reused between contact queries.
export function containerContacts(item, container, out) {
  const verts = worldVerts(item);

  if (container.type === 'circle') {
    if (!verts) {
      const d = Math.hypot(item.x, item.y);
      const ex = d + item.shape.radius - container.R;
      if (ex <= 0) return out;
      // At the centre every direction is equally bad; pick one arbitrarily.
      const nx = d < 1e-9 ? 1 : item.x / d;
      const ny = d < 1e-9 ? 0 : item.y / d;
      out.push({ nx, ny, ex, px: item.x + nx * item.shape.radius, py: item.y + ny * item.shape.radius });
      return out;
    }
    // Polygon in a circle: the most distant vertex defines the contact.
    const far = farthestVertex(verts);
    const ex = far.d - container.R;
    if (ex <= 0) return out;
    out.push({ nx: far.x / far.d, ny: far.y / far.d, ex, px: far.x, py: far.y });
    return out;
  }

  // Convex container: every violated half-plane is its own contact, so an item
  // wedged into a corner is corrected against both walls.
  for (const p of container.planes) {
    const ex = planeExcess(item, verts, p);
    if (ex <= 0) continue;
    const sp = supportPoint(item, p.nx, p.ny, verts, SCRATCH);
    out.push({ nx: p.nx, ny: p.ny, ex, px: sp[0], py: sp[1] });
  }
  return out;
}

// The largest distance by which an item pokes outside the container, or 0 when
// it is fully inside. Used for scoring, where contact geometry is irrelevant.
export function containmentExcess(item, container) {
  const verts = worldVerts(item);
  if (container.type === 'circle') {
    const reach = verts ? farthestVertex(verts).d : Math.hypot(item.x, item.y) + item.shape.radius;
    return Math.max(0, reach - container.R);
  }
  let worst = 0;
  for (const p of container.planes) worst = Math.max(worst, planeExcess(item, verts, p));
  return worst;
}
