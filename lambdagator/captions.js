// Words for what's happening, and the expression written out in the usual notation with colors
// that match the alligators.
import {groups, recognize, render, toString} from './lambda.js';
import {hueOf, PALETTE} from './gatorLayout.js';
import {about} from './names.js';

const colorName = (hue) => PALETTE.find(([h]) => h === hue)[1];

// how many alligators in a term have this hue
const countHue = (n, hue) =>
  n.type === 'lam'
    ? (hueOf(n.id) === hue) + countHue(n.body, hue)
    : n.type === 'app'
      ? countHue(n.fn, hue) + countHue(n.arg, hue)
      : 0;
const swatch = (hue) => `<span class="swatch" style="--h: ${hue}"></span>`;
const gatorName = (hue) => `${swatch(hue)}${colorName(hue)} alligator`;
const plural = (n, word) =>
  `${['no', 'one', 'two', 'three', 'four', 'five'][n] ?? n} ${word}${n === 1 ? '' : 's'}`;
const chip = (name) => `<span class="chipText">${name}</span>`;
const meal = (n) =>
  n.type === 'ref'
    ? chip(n.name)
    : `the ${{var: 'egg', lam: 'alligator', app: 'whole group'}[n.type]}`;

// a button that explains why a name is defined the way it is (see main.js)
const whyButton = (name) =>
  `<button class="why" data-why="${name}">Why is it built like that?</button>`;

// groups that are down to one thing after a step, so their old alligators leave
const lonelyGroups = (step) => {
  const after = groups(step.result);
  return new Set([...groups(step.renamedTree)].filter((id) => !after.has(id)));
};

// In seen, names that have already opened up, which don't need explaining again, and RENAMED once
// letters have been renamed
export const RENAMED = ' renamed';
export const describe = (step, seen = new Set()) => {
  if (step.kind === 'unfold') {
    const {name} = step.ref;
    const known = about(name);
    if (seen.has(name)) {
      return `Another ${chip(name)}. Open it up to see the alligators inside.`;
    }
    return known
      ? `${chip(name)} ${known.meaning} ${whyButton(name)} Open it up to see the alligators inside.`
      : `${chip(name)} is defined here as <code>${toString(step.definition)}</code>. Open it up to see the alligators inside.`;
  }
  const {lam, redex, occurrences} = step;
  const hue = hueOf(lam.id);
  const color = colorName(hue);
  const n = occurrences.length;
  // copies share colors, so say which one if there's more than one
  const which =
    countHue(step.renamedTree, hue) > 1 ? ' with its mouth open' : '';
  const eats = `The ${gatorName(hue)}${which} is hungry, so it eats ${meal(redex.arg)} to its right.`;
  const then = n
    ? `Then it dies, and its ${n === 1 ? `${color} egg hatches into a copy` : `${plural(n, color + ' egg')} hatch into copies`} of what it ate.`
    : `Then it dies. It has no ${color} eggs, so what it ate is gone for good.`;
  const old = lonelyGroups(step).size
    ? ' An old alligator left guarding just one thing leaves too.'
    : '';
  // the notation renames letters to avoid mix-ups, which would look like a mistake if unexplained
  const renamed =
    step.renamed.length && !seen.has(RENAMED)
      ? ` <span class="note">(In the symbols underneath, ${step.renamed.map((r) => `<code>${r.from}</code> becomes <code>${r.to}</code>`).join(' and ')} so the two don’t get mixed up.)</span>`
      : '';
  return `${eats} ${then}${old}${renamed}`;
};

// a note about parts that were just recognized and shown by name
export const describeFolds = (folds) => {
  const names = [...new Set(folds.map((f) => f.to.name))];
  const list = names.map(chip).join(' and ');
  return `<span class="note">Part of this is exactly ${list} again, so it’s shown by name.</span><br>`;
};

// if a term is f(f(…(f x))) for eggs with no alligator, which ones and how many fs
const repetitions = (n) => {
  const f = n.type === 'app' && n.fn.type === 'var' && n.fn.name;
  let count = 0;
  for (; n.type === 'app' && n.fn.type === 'var' && n.fn.name === f; count++) {
    n = n.arg;
  }
  return f && n.type === 'var' && n.name !== f
    ? {f, x: n.name, count}
    : undefined;
};

// used: the names the program used. A result is only called by those names (or a number, if it
// used numbers), since anything else would be a name the viewer hasn't met.
export const describeEnd = (tree, defs, steps, used) => {
  const usesNumbers = [...used].some((name) => /^\d+$/.test(name));
  const names = recognize(tree, defs).filter(
    (name) =>
      name !== toString(tree) &&
      (used.has(name) || (usesNumbers && /^\d+$/.test(name))),
  );
  const done = steps
    ? `<b>Done after ${steps} step${steps === 1 ? '' : 's'}.</b>`
    : '<b>Nothing to do.</b>';
  const list = names.map(chip).join(' or ');
  const known = !names.length
    ? ''
    : tree.type === 'ref'
      ? ` Also known as ${list}.`
      : ` It’s ${list}.`;
  // only worth pointing out when the lesson is about numbers
  const repeated = usesNumbers && repetitions(tree);
  const times = repeated
    ? ` That’s <code>${repeated.f}</code> done ${repeated.count === 1 ? 'once' : `${repeated.count} times`} to <code>${repeated.x}</code>.`
    : '';
  return `${done} No alligator has anything to its right to eat, so this is the answer.${known}${times}`;
};

// The expression in notation, with each lambda and its variables in its alligator's color, and
// the part that's about to change (if any) underlined.
export const notation = (tree, changing) => {
  const ink = (text, binder) =>
    binder === undefined
      ? text
      : `<span style="color: hsl(${hueOf(binder)} 65% 38%)">${text}</span>`;
  return render(tree, {
    name: ink,
    lambda: (chain) =>
      ink('λ', chain[0].id) +
      chain.map((l) => ink(l.param, l.id)).join('') +
      ink('.', chain[0].id),
    node: (n, text) =>
      n.id === changing ? `<span class="changing">${text}</span>` : text,
  });
};
