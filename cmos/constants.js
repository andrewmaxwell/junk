import { color } from '../sand/makeRenderer.js';

export const M_EMPTY = 0;
export const M_WIRE = 1;
export const M_PTYPE = 2;
export const M_NTYPE = 3;
export const M_GATE = 4;
export const M_VCC = 5;
export const M_GND = 6;
export const M_BRIDGE = 7;

export const CHARGE_GND = 0;
export const CHARGE_VCC = 1;
export const CHARGE_Z = 2;

export const WIDTH = 64;
export const HEIGHT = 64;

export const materialDefs = [
  {
    id: M_WIRE,
    name: 'Wire',
    r: 68,
    g: 71,
    b: 90,
    description: 'conducts electricity',
  },
  {
    id: M_PTYPE,
    name: 'P-Type',
    r: 255,
    g: 184,
    b: 108,
    description: 'silicon channel that conducts when gate is low',
  },
  {
    id: M_NTYPE,
    name: 'N-Type',
    r: 189,
    g: 147,
    b: 249,
    description: 'silicon channel that conducts when gate is high',
  },
  {
    id: M_GATE,
    name: 'Gate',
    r: 255,
    g: 255,
    b: 255,
    description: 'controls adjacent p/n type silicon channels',
  },
  {
    id: M_VCC,
    name: 'VCC',
    r: 255,
    g: 51,
    b: 102,
    description: 'power source. supplies high',
  },
  {
    id: M_GND,
    name: 'GND',
    r: 51,
    g: 102,
    b: 255,
    description: 'ground source. supplies low',
  },
  {
    id: M_BRIDGE,
    name: 'Bridge',
    r: 139,
    g: 233,
    b: 253,
    description: 'allows wires to cross without connecting',
  },
  {
    id: M_EMPTY,
    name: 'Empty (Eraser)',
    r: 18,
    g: 18,
    b: 18,
    description: 'removes material from the grid',
  },
];

export const materialColors = new Uint32Array(8);
materialDefs.forEach((m) => {
  materialColors[m.id] = color(m.r, m.g, m.b);
});

export const C_WIRE_HIGH = color(80, 250, 123);
export const C_WIRE_LOW = color(0, 68, 136);
export const C_WIRE_Z = materialColors[M_WIRE];
