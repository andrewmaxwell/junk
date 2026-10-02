// The explanations around the stage: the "What is this?" dialog with the rules illustrated, the
// "Why?" dialog for each built-in name, and the list of built-in names.
import {parseProgram, reduceStep, prelude} from './lambda.js';
import {gatorLayout, marksFor} from './gatorLayout.js';
import {about, builtInNames} from './names.js';
import {drawStatic} from './stage.js';

const $ = (id) => document.getElementById(id);
const chip = (name) => `<span class="chipText">${name}</span>`;

// the definition of a built-in name or number, written out
const definitions = new Map(
  prelude.split('\n').map((line) => line.split(' = ')),
);
const definitionOf = (name) => {
  if (!/^\d+$/.test(name)) return definitions.get(name);
  const n = Number(name);
  return n ? `λfx.${'f('.repeat(n - 1)}fx${')'.repeat(n - 1)}` : 'λfx.x';
};

// clicking outside a dialog closes it
const closeOnBackdrop = (dialog) =>
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

// draws the rules in the "What is this?" dialog with the same alligators as everywhere else
const illustrateRules = () => {
  const illustrate = (id, ...layouts) => {
    layouts.forEach((lay, i) => {
      if (i) {
        $(id).append(
          Object.assign(document.createElement('span'), {textContent: '→'}),
        );
      }
      drawStatic(lay, $(id).appendChild(document.createElement('div')), 0.65);
    });
  };
  const example = (src) => {
    const {tree, defs} = parseProgram(src);
    const step = reduceStep(tree, defs);
    return {tree, step, marks: step && marksFor(step)};
  };
  let ex = example('(λa.a)(λb.b)');
  illustrate('rule-eat', gatorLayout(ex.tree, ex.marks));
  illustrate('rule-eggs', gatorLayout(example('λab.ba').tree));
  ex = example('(λa.aa)(λb.b)');
  illustrate(
    'rule-hatch',
    gatorLayout(ex.tree, ex.marks),
    gatorLayout(ex.step.result),
  );
  ex = example('x((λb.b)y)');
  illustrate('rule-old', gatorLayout(ex.tree), gatorLayout(ex.step.result));
};

// tryIt(src) loads an expression, for the Try it buttons
export const setUpHelp = ({tryIt}) => {
  illustrateRules();
  $('aboutButton').addEventListener('click', () => $('about').showModal());
  $('closeAbout').addEventListener('click', () => $('about').close());
  closeOnBackdrop($('about'));

  // any element with data-why="NAME" explains why NAME is built the way it is
  document.addEventListener('click', (e) => {
    const name = e.target.closest('[data-why]')?.dataset.why;
    if (!name) return;
    $('whyBody').innerHTML = `
      <h2>Why is ${chip(name)} <code>${definitionOf(name)}</code>?</h2>
      <p>${about(name).why}</p>`;
    $('tryIt').innerHTML = `Try it: <code>${about(name).tryIt}</code>`;
    $('tryIt').dataset.src = about(name).tryIt;
    $('why').showModal();
  });
  $('tryIt').addEventListener('click', () => {
    $('why').close();
    tryIt($('tryIt').dataset.src);
  });
  $('closeWhy').addEventListener('click', () => $('why').close());
  closeOnBackdrop($('why'));

  for (const name of [...builtInNames, '2']) {
    const row = $('names').appendChild(document.createElement('div'));
    row.className = 'name';
    row.innerHTML =
      name === '2'
        ? `${chip('0, 1, 2, …')} <code>2 = ${definitionOf(name)}</code>
          <span>A number eats two things, f and x, and does f to x that many times.</span>`
        : `${chip(name)} <code>${definitionOf(name)}</code> <span>${about(name).meaning}</span>`;
    row.innerHTML += `<button class="why" data-why="${name}">Why?</button>`;
  }
};

// whether a dialog is open, so keys shouldn't control the stage
export const helpIsOpen = () => $('about').open || $('why').open;
