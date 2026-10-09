import {makeEvaluator} from './search.js';
import {makeRenderer} from './render.js';
import {mutate, randomRule} from './rule.js';

// (named from when this project was lenia3d; kept so starred rules survive)
const storageKey = 'lenia3d-flow-favorites';
const maxResults = 48; // not counting favorites

const loadFavorites = () => {
  try {
    const favorites = JSON.parse(localStorage.getItem(storageKey)) ?? [];
    // ones saved before there were several kinds of matter have just one
    for (const {rule} of favorites) {
      rule.channels ??= 1;
      for (const k of rule.kernels) Object.assign(k, {from: 0, to: 0, ...k});
    }
    return favorites;
  } catch {
    return [];
  }
};
const saveFavorites = (favorites) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(favorites));
  } catch {
    // private window or full storage: favorites just won't outlast the page
  }
};

// Searches for rules in the background and shows what it keeps as
// thumbnails. Clicking one calls onPick with its rule. Starred ones are saved,
// and new tries are often small variations on them or on earlier finds.
// getOptions gives the starting density, the food settings ({pull, eat,
// regrow}), and how many kinds of matter fresh rules should have.
export const makeGallery = (device, getOptions, onPick) => {
  const N = 64;
  const {sim, evaluate} = makeEvaluator(device, N);

  // thumbnails are drawn by the same renderer, from the search's small world
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbCanvas.height = 256;
  const thumbContext = thumbCanvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  thumbContext.configure({device, format});
  const renderThumb = makeRenderer(device, thumbContext, format, sim);
  const snapshot = (rule) => {
    const encoder = device.createCommandEncoder();
    renderThumb(encoder, {
      yaw: 0.6,
      pitch: 0.35,
      distance: 2.6,
      threshold: 0.4,
      colorMode: rule.channels > 1 ? 1 : 0,
    });
    device.queue.submit([encoder.finish()]);
    return thumbCanvas.toDataURL('image/jpeg', 0.85);
  };

  let favorites = loadFavorites();
  let results = [];
  let tried = 0;
  let running = false;
  let loop = null; // the running search, so stopping and restarting doesn't start two

  const element = document.createElement('div');
  element.id = 'gallery';
  element.innerHTML = `<div class="status"></div><div class="grid"></div>`;
  const [status, grid] = element.children;
  document.body.append(element);

  const describe = ({motion, bodies}) =>
    `moving ${motion.toFixed(2)} · ${bodies} ${bodies === 1 ? 'body' : 'bodies'}`;

  const showStatus = () => {
    status.textContent = running
      ? `Searching… tried ${tried}, kept ${results.length}`
      : `Tried ${tried}, kept ${results.length}. ${favorites.length} starred.`;
  };

  const card = (item, starred) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<img><button class="star"></button><div class="caption"></div>`;
    const [img, star, caption] = div.children;
    img.src = item.image;
    star.textContent = starred ? '★' : '☆';
    caption.textContent = describe(item);
    div.addEventListener('click', () => onPick(item.rule));
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      if (starred) {
        favorites = favorites.filter((f) => f !== item);
        results.unshift(item);
      } else {
        results = results.filter((r) => r !== item);
        favorites.unshift(item);
      }
      saveFavorites(favorites);
      show();
    });
    return div;
  };

  const show = () => {
    grid.replaceChildren(
      ...favorites.map((item) => card(item, true)),
      ...results.map((item) => card(item, false)),
    );
    showStatus();
  };

  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  // Random rules already do well here, so the search mixes fresh ones with
  // variations on starred ones and earlier finds.
  const nextRule = () => {
    const r = Math.random();
    if (favorites.length && r < 0.4) return mutate(pick(favorites).rule);
    if (results.length && r < 0.6) return mutate(pick(results).rule);
    return randomRule(getOptions().channels);
  };

  const searchLoop = async () => {
    while (running) {
      const rule = nextRule();
      const {density, food} = getOptions();
      const score = await evaluate(rule, {density, food});
      tried++;
      if (score) {
        results.unshift({rule, ...score, image: snapshot(rule)});
        results = results.slice(0, maxResults);
        show();
      } else {
        showStatus();
      }
    }
  };

  show();

  return {
    element,
    hasFavorites: favorites.length > 0,
    setRunning: (value) => {
      if (value === running) return;
      running = value;
      showStatus();
      if (running && !loop) loop = searchLoop().finally(() => (loop = null));
    },
    clear: () => {
      results = [];
      tried = 0;
      show();
    },
  };
};
