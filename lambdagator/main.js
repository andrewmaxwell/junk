import {
  parseProgram,
  reduceStep,
  countNodes,
  canonical,
  knownValues,
  foldValues,
  namesUsed,
  definitionsUsed,
  toString,
} from './lambda.js';
import {
  gatorLayout,
  marksFor,
  resetHues,
  setDefinitions,
} from './gatorLayout.js';
import {
  describe,
  describeEnd,
  describeFolds,
  notation,
  RENAMED,
} from './captions.js';
import {animateEat, animateFold, animateUnfold} from './animate.js';
import {lessons} from './examples.js';
import {setUpHelp, helpIsOpen} from './help.js';
import {Stage} from './stage.js';

const MAX_STEPS = 500;
const MAX_NODES = 600;
// Fast forwarding starts this many times faster than normal, then speeds up through the middle
// of a long run and slows back down at the end, up to this much faster again.
const FAST_SPEED = 4;
const FAST_PEAK = 8;

const $ = (id) => document.getElementById(id);
const input = $('input');

let source; // what was typed in
let tree; // current expression
let defs; // named definitions
let known; // terms with names, to show by name when they come up (see foldValues)
let seen = new Set(); // what's been explained, so captions don't repeat themselves (see describe)
let past = []; // previous expressions, for going back
let generation = 0; // bumped to cancel whatever is running
let waiting; // while waiting for the viewer, resolves the wait with a target (or nothing for Next)
let preview; // between steps, the step that Next will do
let watching = false; // fast forwarding, without stopping or captions
let fast = {done: 0, total: 1, speed: FAST_SPEED}; // how far through fast forwarding it is
let atEnd = false; // there's nothing left to do, or it gave up

const stage = new Stage($('stage'), {
  onHover: (target) => hover(target),
  onClick: (target) => click(target),
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const show = (lay, ms, options) =>
  stage.show(lay, watching ? ms / fast.speed : ms, options);

const caption = (html) => {
  if (!watching) $('caption').innerHTML = html;
};

// draws the expression, with the step about to happen (if any) pointed out
const draw = (step, ms) => {
  show(gatorLayout(tree, step && marksFor(step)), ms);
  $('current').innerHTML = notation(
    tree,
    step && (step.kind === 'unfold' ? step.ref.id : step.redex.id),
  );
};

// the lesson being shown, if it is one, and the one after it
const lesson = () => lessons.find((l) => l.src === source);
const nextLesson = () => lesson() && lessons[lesson().number];

// which lessons have been finished, by their expression
let done = new Set();
try {
  done = new Set(JSON.parse(localStorage.lambdagatorDone ?? '[]'));
} catch {
  // start with none done
}

// the path through the lessons, by chapter: a button for each, marked when it's done
const dots = new Map(); // src -> button
let chapterEl;
for (const l of lessons) {
  if (l.chapter.lessons[0].src === l.src) {
    chapterEl = $('path').appendChild(document.createElement('div'));
    chapterEl.className = 'chapter';
    chapterEl.innerHTML = `<span class="name">${l.chapter.title}</span>`;
  }
  const dot = chapterEl.appendChild(document.createElement('button'));
  dot.className = 'dot';
  dot.textContent = l.number;
  dot.title = l.title;
  dot.addEventListener('click', () => load(l.src));
  dots.set(l.src, dot);
}

const showLesson = () => {
  for (const [src, dot] of dots) {
    dot.classList.toggle('done', done.has(src));
    dot.classList.toggle('current', src === source);
    // on narrow screens the path scrolls sideways, so keep the current lesson in view
    if (src === source) {
      dot.parentElement.parentElement.scrollLeft =
        dot.offsetLeft - dot.parentElement.parentElement.clientWidth / 2;
    }
  }
  const l = lesson();
  $('lessonTitle').textContent = l
    ? `${l.number}. ${l.title}`
    : 'Your own expression';
  $('lessonGoal').textContent = l
    ? l.goal
    : 'Press Next to watch it run, or pick a lesson above.';
};

// every definition the expression depends on, built up from plain lambdas, so there's nothing
// hidden behind the names
const showDefinitions = () => {
  $('lessonDefs').innerHTML = definitionsUsed(tree, defs)
    .map(
      ({name, term}) =>
        `<span class="def"><b>${name}</b> = ${toString(term)}</span>`,
    )
    .join('');
};

const updateControls = () => {
  // at the end, Next goes on to the next lesson, or starts over after the last one
  const upNext = atEnd && nextLesson();
  $('next').textContent = upNext
    ? 'Next lesson ▸'
    : atEnd
      ? '↺ Start over'
      : 'Next ▸';
  $('next').disabled =
    !waiting && !watching && !(atEnd && (upNext || past.length));
  $('back').disabled = !past.length;
  $('watch').textContent = watching ? '■ Stop' : '⏩ Fast forward';
  $('count').textContent = tree ? `step ${past.length}` : '';
};

const stop = (message) => {
  watching = false;
  atEnd = true;
  if (lesson()) {
    done.add(source);
    try {
      localStorage.lambdagatorDone = JSON.stringify([...done]);
    } catch {
      // it just won't be remembered
    }
    showLesson();
  }
  const upNext = nextLesson();
  caption(
    upNext
      ? `${message}<br><span class="note">Up next: ${upNext.title}</span>`
      : message,
  );
  updateControls();
};

const finish = () => {
  draw(undefined, 400);
  stop(describeEnd(tree, defs, past.length, namesUsed(past[0] ?? tree, defs)));
};

const waitForViewer = () =>
  new Promise((resolve) => {
    waiting = resolve;
    updateControls();
  });

// if it's waiting for the viewer, go on
const proceed = (target) => {
  if (!waiting) return;
  const resolve = waiting;
  waiting = undefined;
  updateControls();
  resolve(target);
};

// Goes through the expression one step at a time. Between steps it shows what's next and waits
// for the viewer to press Next or click a different step, unless they're watching it all.
const run = async () => {
  const gen = generation;
  const phase = async (lay, ms, {pause = 0, ...options} = {}) => {
    await show(lay, ms, options);
    if (gen === generation && !watching) await wait(pause);
    return gen === generation;
  };
  let note = ''; // what got folded in the last step
  for (;;) {
    let step = reduceStep(tree, defs);
    if (!step) return finish();
    // if it's back to how it looked before, it'll go around in circles forever
    const now = canonical(tree);
    const before = past.findLastIndex((t) => canonical(t) === now);
    if (before >= 0) {
      const ago = past.length - before;
      draw(undefined, 400);
      return stop(
        `<b>This will never finish.</b> It looks exactly like it did ${ago === 1 ? 'one step' : `${ago} steps`} ago, so it would keep going around in circles forever.`,
      );
    }
    if (past.length >= MAX_STEPS) {
      return stop(
        `Stopped after ${MAX_STEPS} steps. This one might never finish.`,
      );
    }
    if (watching) {
      // ease in and out: slowest at the start and end, fastest in the middle of a long run
      const peak = Math.min(FAST_PEAK, Math.max(1, fast.total / 10));
      const middle = Math.sin(
        Math.PI * Math.min(1, (fast.done + 0.5) / fast.total),
      );
      fast.speed = FAST_SPEED * (1 + (peak - 1) * middle);
      fast.done++;
      await wait((150 * FAST_SPEED) / fast.speed);
    } else {
      preview = step;
      caption(note + describe(step, seen));
      draw(step, 400);
      const target = await waitForViewer();
      preview = undefined;
      if (target !== undefined) step = reduceStep(tree, defs, target);
    }
    if (gen !== generation) return;
    if (countNodes(step.result) > MAX_NODES) {
      return stop('Stopped because the expression is getting too big to show.');
    }
    if (step.kind === 'unfold') seen.add(step.ref.name);
    if (step.renamed?.length) seen.add(RENAMED);
    const animate = step.kind === 'unfold' ? animateUnfold : animateEat;
    const finished = await animate(step, {
      tree,
      watching,
      phase,
      commit: () => {
        past.push(tree);
        tree = step.result;
        $('current').innerHTML = notation(tree);
        updateControls();
      },
    });
    if (!finished) return;

    // show anything that's now exactly something with a name by that name
    const {tree: folded, folds} = foldValues(tree, known);
    note = folds.length ? describeFolds(folds) : '';
    if (folds.length) {
      const unfolded = tree;
      tree = folded;
      $('current').innerHTML = notation(tree);
      if (!(await animateFold(unfolded, folded, folds, {phase}))) return;
    }
  }
};

// cancel whatever is going on, so something else can start
const cancel = () => {
  generation++;
  proceed();
  preview = undefined;
  atEnd = false;
  watching = false;
};

// stop watching it all, and go back to stepping from wherever it got to
const stopWatching = () => {
  cancel();
  updateControls();
  run();
};

// go back to the beginning, with the same colors as the first time
const rewind = () => {
  cancel();
  seen = new Set();
  if (past.length) {
    tree = past[0];
    past = [];
  }
  resetHues();
};

// how many steps are left, to pace fast forwarding
const stepsLeft = () => {
  let t = tree;
  let n = 0;
  for (let step; n < MAX_STEPS && (step = reduceStep(t, defs)); n++) {
    t = foldValues(step.result, known).tree;
  }
  return Math.max(1, n);
};

// plays the rest quickly, from wherever it is (or from the start, if it's finished)
const fastForward = () => {
  if (watching) return stopWatching();
  if (atEnd) rewind();
  else cancel();
  fast = {done: 0, total: stepsLeft(), speed: FAST_SPEED};
  $('caption').innerHTML = '';
  watching = true;
  updateControls();
  run();
};

const click = (target) => {
  if (watching) stopWatching();
  else if (preview) proceed(target);
};

// between steps, hovering over a different step shows that one instead
const hover = (target) => {
  if (!preview) return;
  const step = target === undefined ? preview : reduceStep(tree, defs, target);
  caption(describe(step, seen));
  draw(step, 200);
};

const back = () => {
  if (!past.length) return;
  cancel();
  tree = past.pop();
  updateControls();
  run();
};

const go = () => {
  cancel();
  seen = new Set();
  source = input.value;
  location.hash = encodeURIComponent(source);
  showLesson();
  try {
    ({tree, defs} = parseProgram(input.value));
    known = knownValues(tree, defs);
    setDefinitions(defs);
    showDefinitions();
    $('error').textContent = '';
  } catch (e) {
    $('error').textContent = e.message;
    return;
  }
  past = [];
  resetHues();
  stage.clear();
  stage.view = stage.fit(gatorLayout(tree));
  updateControls();
  run();
};

const resizeInput = () => {
  input.rows = input.value.split('\n').length;
};

// shows a lesson, or anything else
const load = (src) => {
  input.value = src;
  resizeInput();
  go();
};

const showEditor = (open) => {
  $('editor').hidden = !open;
  $('editButton').setAttribute('aria-expanded', open);
  if (open) input.focus();
  refit();
};

const next = () => {
  if (watching) stopWatching();
  else if (atEnd && nextLesson()) load(nextLesson().src);
  else if (atEnd) {
    rewind();
    updateControls();
    run();
  } else proceed();
};

input.addEventListener('input', () => {
  // typing a backslash gives you a λ
  if (input.value.includes('\\')) {
    const pos = input.selectionStart;
    input.value = input.value.replace(/\\/g, 'λ');
    input.setSelectionRange(pos, pos);
  }
  resizeInput();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    go();
  }
});
$('go').addEventListener('click', go);
$('next').addEventListener('click', next);
$('back').addEventListener('click', back);
$('watch').addEventListener('click', fastForward);
window.addEventListener('keydown', (e) => {
  if (e.target === input || helpIsOpen()) return;
  if (e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault();
    next();
  } else if (e.key === 'ArrowLeft') back();
});
// the stage changes size when the window does or the editor opens or closes
const refit = () =>
  tree && show(gatorLayout(tree, preview && marksFor(preview)), 0);
window.addEventListener('resize', refit);

$('editButton').addEventListener('click', () => showEditor($('editor').hidden));
setUpHelp({
  tryIt: (src) => {
    showEditor(true);
    load(src);
  },
});

// start with what's in the URL, or the first lesson. Anything that isn't a lesson is shown in the
// editor.
const start = decodeURIComponent(location.hash.slice(1));
if (start && !lessons.some((l) => l.src === start)) showEditor(true);
load(start || lessons[0].src);
