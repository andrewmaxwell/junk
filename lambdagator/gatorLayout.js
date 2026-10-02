// Lays out a term as Bret Victor's alligator eggs (worrydream.com/AlligatorEggs):
// a lambda is a hungry alligator guarding its family below it, a variable is an egg colored like
// the alligator it belongs to, and an old (gray) alligator groups an application, like parentheses.
// stage.js animates between layouts.
import {origin, definition} from './lambda.js';
import {staticMarkup} from './stage.js';

// Alligator colors, each different enough to have its own name, in the order they're handed out
export const PALETTE = [
  [212, 'blue'],
  [28, 'brown'],
  [125, 'green'],
  [320, 'pink'],
  [272, 'purple'],
  [50, 'gold'],
  [178, 'teal'],
  [355, 'red'],
  [85, 'lime'],
];

// Each lambda gets its own hue, until they run out. Copies of a lambda keep the hue of the lambda
// they came from.
const hues = new Map();
let hueCount = 0;
export const resetHues = () => {
  hues.clear();
  hueCount = 0;
};
export const hueOf = (id) => {
  if (!hues.has(id)) {
    hues.set(
      id,
      origin.has(id)
        ? hueOf(origin.get(id))
        : PALETTE[hueCount++ % PALETTE.length][0],
    );
  }
  return hues.get(id);
};

// what to highlight before a step: the hungry alligator, its eggs, and its meal, or a name chip
export const marksFor = (step) =>
  step.kind === 'unfold'
    ? {unfold: step.ref.id}
    : {fn: step.lam.id, occ: new Set(step.occurrences), arg: step.redex.arg.id};

const EGG_W = 30;
const EGG_H = 38;
const GATOR_H = 34;
const HEAD = 34; // room for the head to the right of the family
const PAD = 6; // family's indent under its alligator
const VGAP = 6; // between an alligator and its family
const GAP = 16; // between things side by side
const CHIP_H = 40;
const MINI_H = CHIP_H - 10; // the faint drawing inside a chip
const MINI_W = 150;

// Name chips show a faint drawing of the alligators they stand for, so they're not a mystery box.
// They need the program's definitions, and draw each name once.
let definitions;
const miniatures = new Map(); // name -> {html, w}
export const setDefinitions = (defs) => {
  definitions = defs;
  miniatures.clear();
};
const miniature = (name) => {
  if (!miniatures.has(name)) {
    const term = definitions && definition(name, definitions);
    let mini = {html: '', w: 0};
    if (term) {
      const lay = gatorLayout(term, {miniature: true});
      const scale = Math.min(MINI_H / lay.h, MINI_W / lay.w);
      mini = {
        html: `<div class="mini" style="width: ${lay.w * scale}px; height: ${lay.h * scale}px">${staticMarkup(lay, scale)}</div>`,
        w: lay.w * scale,
      };
    }
    miniatures.set(name, mini);
  }
  return miniatures.get(name);
};

const GATOR_HTML =
  '<div class="g-body"></div><div class="g-jaw g-upper"></div><div class="g-jaw g-lower"></div><div class="g-eye"></div>';

// Each item is a positioned element with a key that stays the same from step to step:
// g = alligator, o = old alligator, e = egg, r = name chip, h = highlight around a meal, followed by
// a node id. An old alligator is keyed by the application whose argument it guards, so it stays the
// same alligator while what it guards changes. Items also have their node (the id of the node they
// draw), a hue, saturation c (0 for free variables), and emphasis em (1 when highlighted).
//
// marks:
//   fn: the hungry alligator, which opens its mouth
//   occ: its eggs, which jiggle
//   arg: its meal, which gets outlined
//   unfold: a name chip that's about to open up
//   keepOld: ids of applications whose old alligator should stay even though it only guards one
//     thing, so it can be shown leaving
//   hide: id of a lambda whose alligator has died, but whose family hasn't moved up yet
//   top: where the top edge should go, to line up with another layout (otherwise it's centered)
//   miniature: it's the faint drawing inside a chip, so it gets its own colors (rather than taking
//     the next ones from the picture), and its chips are plain
export const gatorLayout = (tree, marks = {}) => {
  const miniHues = new Map();
  const hue = marks.miniature
    ? (id) => {
        if (!miniHues.has(id)) {
          miniHues.set(id, PALETTE[miniHues.size % PALETTE.length][0]);
        }
        return miniHues.get(id);
      }
    : hueOf;
  let items = [];
  const bounds = new Map(); // node id -> {x, y, w, h}
  const gators = new Map(); // lambda id -> item
  let mouth;

  const gator = (key, x, y, hue, extra) => {
    const item = {
      kind: 'gator',
      key,
      x,
      y,
      w: 0,
      h: GATOR_H,
      hue,
      c: hue === null ? 0 : 1,
      em: 0,
      html: GATOR_HTML,
      ...extra,
    };
    items.push(item);
    return item;
  };

  const lay = (n, x, y, env) => {
    const r = layNode(n, x, y, env);
    bounds.set(n.id, {x, y, w: r.w, h: r.h});
    return r;
  };

  const layNode = (n, x, y, env) => {
    if (n.type === 'var') {
      const binder = env.get(n.name);
      const free = binder === undefined;
      items.push({
        kind: 'egg',
        key: 'e' + n.id,
        x,
        y,
        w: EGG_W,
        h: EGG_H,
        hue: free ? null : hue(binder),
        c: free ? 0 : 1,
        em: marks.occ?.has(n.id) ? 1 : 0,
        node: n.id,
        // only eggs with no alligator need their name
        text: free ? n.name : '',
        // the two halves of the shell can crack apart
        html: '<div class="shell"><div class="half top"></div><div class="half bottom"></div><span class="text"></span></div>',
      });
      return {w: EGG_W, h: EGG_H};
    }

    if (n.type === 'ref') {
      const mini = marks.miniature ? {html: '', w: 0} : miniature(n.name);
      const w = Math.max(n.name.length * 13 + 20, mini.w + 16);
      items.push({
        kind: 'chip',
        key: 'r' + n.id,
        text: n.name,
        html: `${mini.html}<span class="text"></span>`,
        x,
        y: y + (EGG_H - CHIP_H) / 2,
        w,
        h: CHIP_H,
        hue: 40,
        c: 0,
        em: marks.unfold === n.id ? 1 : 0,
        node: n.id,
        target: n.id,
      });
      return {w, h: EGG_H};
    }

    if (n.type === 'lam') {
      const g = gator('g' + n.id, x, y, hue(n.id), {
        em: marks.fn === n.id ? 1 : 0,
        node: n.id,
        z: 10, // above the outline around a meal, so it can still be clicked
      });
      gators.set(n.id, g);
      const body = lay(
        n.body,
        x + PAD,
        y + GATOR_H + VGAP,
        new Map(env).set(n.param, n.id),
      );
      g.w = Math.max(body.w + PAD + HEAD, 70);
      if (marks.fn === n.id) mouth = {cx: x + g.w - 8, cy: y + GATOR_H / 2};
      return {w: g.w, h: GATOR_H + VGAP + body.h};
    }

    const fn = lay(n.fn, x, y, env);
    // a hungry alligator with something to its right can be clicked to make it eat
    if (n.fn.type === 'lam') gators.get(n.fn.id).target = n.id;
    const ax = x + fn.w + GAP;
    let arg;
    if (n.arg.type === 'app' || marks.keepOld?.has(n.id)) {
      // an old alligator keeps a group together
      const g = gator('o' + n.id, ax, y, null, {cls: 'old', node: n.arg.id});
      arg = lay(n.arg, ax + PAD, y + GATOR_H + VGAP, env);
      g.w = arg.w + PAD + HEAD / 2;
      arg = {w: g.w, h: GATOR_H + VGAP + arg.h};
      bounds.set(n.arg.id, {x: ax, y, ...arg});
    } else arg = lay(n.arg, ax, y, env);
    return {w: fn.w + GAP + arg.w, h: Math.max(fn.h, arg.h)};
  };

  const root = lay(tree, 0, 0, new Map());

  if (marks.arg !== undefined) {
    const b = bounds.get(marks.arg);
    items.push({
      kind: 'highlight',
      key: 'h' + marks.arg,
      x: b.x - 6,
      y: b.y - 6,
      w: b.w + 12,
      h: b.h + 12,
      hue: hue(marks.fn),
      c: 1,
      em: 1,
      node: marks.arg,
    });
  }

  if (marks.hide !== undefined) {
    items = items.filter((it) => it.key !== 'g' + marks.hide);
  }

  // center vertically around 0, which is where the stage puts the middle of the screen
  const top = marks.top ?? -root.h / 2;
  for (const item of items) item.y += top;
  for (const b of bounds.values()) b.y += top;
  if (mouth) mouth.cy += top;

  return {items, bounds, mouth, w: root.w, h: root.h, top};
};
