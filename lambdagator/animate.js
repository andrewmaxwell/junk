// The animations for each kind of step. Each takes the step and a context:
//   tree: the current expression
//   phase(layout, ms, options): animates to a layout (see Stage.show), then pauses for
//     options.pause ms. Resolves to false if the step was cancelled partway.
//   watching: whether it's playing quickly from start to finish, with no preview before each step
//   commit(): makes the step's result the current expression
// and resolves to false if it was cancelled.
import {groups, subtreeIds} from './lambda.js';
import {gatorLayout, marksFor} from './gatorLayout.js';

const SMALL = 0.3; // how small a meal gets in an alligator's mouth

// An alligator eats what's to its right, then what it ate flies out of its mouth to each of its
// eggs, growing back to full size, while it dies. (Renaming variables to avoid capture isn't
// shown, since colors already tell the alligators apart.)
export const animateEat = async (step, {phase, watching, commit}) => {
  const {redex, lam, occurrences, renamedTree, copies} = step;
  const before = gatorLayout(renamedTree, marksFor(step));
  if (watching && !(await phase(before, 500))) return false;

  // 1. the meal shrinks into its mouth while its eggs jiggle
  const {mouth} = before;
  const mealIds = subtreeIds(redex.arg);
  const mealBox = before.bounds.get(redex.arg.id);
  const shrink = (item) => {
    // keep each piece in place within the meal, as if the whole meal were scaled down
    const cx =
      mouth.cx + (item.x + item.w / 2 - (mealBox.x + mealBox.w / 2)) * SMALL;
    const cy =
      mouth.cy + (item.y + item.h / 2 - (mealBox.y + mealBox.h / 2)) * SMALL;
    return {...item, x: cx - item.w / 2, y: cy - item.h / 2, sc: SMALL};
  };
  const eat = {
    ...before,
    items: before.items
      .filter((it) => it.kind !== 'highlight')
      .map((it) => (mealIds.has(it.node) ? shrink(it) : it)),
  };
  if (!(await phase(eat, 900, {pause: 150}))) return false;

  // 2. the meal flies from its mouth to where its eggs were, growing back to full size, and more
  // copies of it split off for any other eggs. The eggs crack open, and the alligator dies,
  // floating away belly-up. Its family stays put until it's gone.
  const hatching = gatorLayout(step.hatching, {
    keepOld: groups(renamedTree), // old alligators only leave in the next part
    hide: lam.id,
    top: eat.top, // so the family doesn't move yet
  });
  const gatorItem = eat.items.find((it) => it.key === 'g' + lam.id);
  const exitTo = new Map([['g' + lam.id, {sy: -1, y: gatorItem.y - 70}]]);
  const enterFrom = new Map();
  const fly = new Map();
  occurrences.forEach((id, i) => {
    exitTo.set('e' + id, {k: 1});
    const copyIds = subtreeIds(copies[i]);
    for (const item of hatching.items) {
      if (copyIds.has(item.node)) {
        // for pieces with no original to start from, like an old alligator around a copy
        enterFrom.set(item.key, {...mouth, sc: SMALL});
        fly.set(item.key, i * (0.3 / occurrences.length));
      }
    }
  });
  commit();
  const hatch = {exitTo, enterFrom, fly, holdView: true, pause: 150};
  if (!(await phase(hatching, 1300, hatch))) return false;

  // 3. everything moves up into the dead alligator's place, and any old alligator that's only
  // guarding one thing now leaves
  const after = gatorLayout(step.result);
  const leaves = new Map(
    hatching.items
      .filter(
        (it) =>
          it.kind === 'gator' && !after.items.some((a) => a.key === it.key),
      )
      .map((it) => [it.key, {sy: -1, y: it.y - 70}]),
  );
  return phase(after, 700, {exitTo: leaves});
};

// a name chip opens up into the alligators it stands for
export const animateUnfold = async (step, {tree, phase, watching, commit}) => {
  if (watching && !(await phase(gatorLayout(tree, marksFor(step)), 400))) {
    return false;
  }
  const after = gatorLayout(step.result);
  const exitTo = new Map([
    ['r' + step.ref.id, after.bounds.get(step.expansion.id)],
  ]);
  commit();
  return phase(after, 900, {exitTo});
};

// parts that turned out to be something with a name shrink into a chip with that name
export const animateFold = async (tree, folded, folds, {phase}) => {
  const before = gatorLayout(tree);
  const after = gatorLayout(folded);
  const exitTo = new Map();
  const enterFrom = new Map();
  for (const {from, to} of folds) {
    const chip = after.bounds.get(to.id);
    const into = {cx: chip.x + chip.w / 2, cy: chip.y + chip.h / 2, sc: 0.2};
    const ids = subtreeIds(from);
    for (const item of before.items) {
      if (ids.has(item.node)) exitTo.set(item.key, into);
    }
    const b = before.bounds.get(from.id);
    enterFrom.set('r' + to.id, {cx: b.x + b.w / 2, cy: b.y + b.h / 2});
  }
  return phase(after, 800, {exitTo, enterFrom});
};
