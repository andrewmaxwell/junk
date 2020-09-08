export const SPRITE_SIZE = 32;

export const DIRS = {RIGHT: 0, DOWN: 1, LEFT: 2, UP: 3};
export const DIR_COORDS = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

export const ACTIONS = {
  REMOVE: 4,
  MOVE: 5,
  DESTROY: 6,
  REFLECT_LEFT: 7,
  REFLECT_RIGHT: 8,
  MOMENTUM: 9,
  SINK: 10,
  MELT: 11,
  TRANSMIT: 12,
};

export const TYPES = {
  EMPTY: {
    id: 0,
    sprite: () => [0, 0],
  },
  TANK: {
    id: 1,
    sprite: (time, dir) => [[2, 3, 4, 1][dir], 0],
    onHit: [ACTIONS.REMOVE, ACTIONS.REMOVE, ACTIONS.REMOVE, ACTIONS.REMOVE],
  },
  FLAG: {
    id: 2,
    sprite: (time) => [5 + (time % 3), 0],
  },
  BLOCK: {
    id: 3,
    sprite: () => [3, 1],
    onHit: [ACTIONS.MOVE, ACTIONS.MOVE, ACTIONS.MOVE, ACTIONS.MOVE],
  },
  WATER: {
    id: 4,
    sprite: (time) =>
      [
        [8, 0],
        [9, 0],
        [0, 1],
      ][time % 3],
    onCollide: (item) => {
      if (item.type === TYPES.BLOCK) return ACTIONS.SINK;
      if (item.type.onHit) return ACTIONS.REMOVE;
    },
  },
  RUBBLE: {
    id: 5,
    sprite: () => [1, 1],
    onHit: [],
  },
  METAL: {
    id: 6,
    sprite: () => [2, 1],
    onHit: [],
  },
  SUNKEN_BLOCK: {
    id: 7,
    sprite: () => [8, 1],
  },
  BELT_UP: {
    id: 8,
    sprite: (time) => [3 + (time % 3), 2],
    slide: DIRS.UP,
  },
  BELT_RIGHT: {
    id: 11,
    sprite: (time) => [6 + (time % 3), 2],
    slide: DIRS.RIGHT,
  },
  BELT_DOWN: {
    id: 9,
    sprite: (time) =>
      [
        [9, 2],
        [0, 3],
        [1, 3],
      ][time % 3],
    slide: DIRS.DOWN,
  },
  BELT_LEFT: {
    id: 10,
    sprite: (time) => [2 + (time % 3), 3],
    slide: DIRS.LEFT,
  },
  BRICK: {
    id: 12,
    sprite: () => [4, 1],
    onHit: [ACTIONS.REMOVE, ACTIONS.REMOVE, ACTIONS.REMOVE, ACTIONS.REMOVE],
  },
  ICE: {
    id: 13,
    sprite: () => [5, 5],
    slide: ACTIONS.MOMENTUM,
  },
  CRACKED_ICE: {
    id: 14,
    sprite: () => [6, 5],
    slide: ACTIONS.MOMENTUM,
    onCollide: (item) => {
      if (item.type === TYPES.TANK) return ACTIONS.MELT;
    },
    melt: true,
  },
  TURRET_UP: {
    id: 18,
    sprite: (time) => [5 + (time % 3), 1],
    onHit: [ACTIONS.MOVE, ACTIONS.DESTROY, ACTIONS.MOVE, ACTIONS.MOVE],
    shootDir: DIRS.UP,
  },
  TURRET_RIGHT: {
    id: 17,
    sprite: (time) => [5 + (time % 3), 3],
    onHit: [ACTIONS.MOVE, ACTIONS.MOVE, ACTIONS.DESTROY, ACTIONS.MOVE],
    shootDir: DIRS.RIGHT,
  },
  TURRET_DOWN: {
    id: 15,
    sprite: (time) =>
      [
        [8, 3],
        [9, 3],
        [0, 4],
      ][time % 3],
    onHit: [ACTIONS.MOVE, ACTIONS.MOVE, ACTIONS.MOVE, ACTIONS.DESTROY],
    shootDir: DIRS.DOWN,
  },
  TURRET_LEFT: {
    id: 16,
    sprite: (time) => [1 + (time % 3), 4],
    onHit: [ACTIONS.DESTROY, ACTIONS.MOVE, ACTIONS.MOVE, ACTIONS.MOVE],
    shootDir: DIRS.LEFT,
  },
  CRYSTAL: {
    id: 23,
    sprite: () => [4, 4],
    onHit: [
      ACTIONS.TRANSMIT,
      ACTIONS.TRANSMIT,
      ACTIONS.TRANSMIT,
      ACTIONS.TRANSMIT,
    ],
  },
  MIRROR_NW: {
    id: 19,
    sprite: () => [9, 1],
    onHit: [
      ACTIONS.REFLECT_LEFT,
      ACTIONS.REFLECT_RIGHT,
      ACTIONS.MOVE,
      ACTIONS.MOVE,
    ],
  },
  MIRROR_NE: {
    id: 20,
    sprite: () => [0, 2],
    onHit: [
      ACTIONS.MOVE,
      ACTIONS.REFLECT_LEFT,
      ACTIONS.REFLECT_RIGHT,
      ACTIONS.MOVE,
    ],
  },
  MIRROR_SE: {
    id: 21,
    sprite: () => [1, 2],
    onHit: [
      ACTIONS.MOVE,
      ACTIONS.MOVE,
      ACTIONS.REFLECT_LEFT,
      ACTIONS.REFLECT_RIGHT,
    ],
  },
  MIRROR_SW: {
    id: 22,
    sprite: () => [2, 2],
    onHit: [
      ACTIONS.REFLECT_RIGHT,
      ACTIONS.MOVE,
      ACTIONS.MOVE,
      ACTIONS.REFLECT_LEFT,
    ],
  },
};

export const TYPE_INDEX = {};
Object.values(TYPES).forEach((t) => (TYPE_INDEX[t.id] = t));

export const SYMBOLS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
