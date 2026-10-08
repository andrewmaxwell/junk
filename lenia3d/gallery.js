import {makeEvaluator, mutate, randomRule} from './search.js';
import {makeRenderer} from './render.js';

const storageKey = 'lenia3d-favorites';
const maxResults = 48; // not counting favorites

const loadFavorites = () => {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? [];
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

// Searches for rules in the background and shows what it keeps as thumbnails.
// Clicking one calls onPick with its rule. Starred ones are saved, and new
// candidates are mostly variations on them.
export const makeGallery = (device, onPick) => {
  const N = 64;
  const {sim, evaluate} = makeEvaluator(device, N);

  // thumbnails are drawn by the same renderer, from the search's small world
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbCanvas.height = 256;
  const thumbContext = thumbCanvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  thumbContext.configure({device, format});
  const renderThumb = makeRenderer(device, thumbContext, format, sim);
  const snapshot = () => {
    const encoder = device.createCommandEncoder();
    renderThumb(encoder, {
      yaw: 0.6,
      pitch: 0.35,
      distance: 2.4,
      threshold: 0.3,
      time: 0,
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

  const describe = ({fill, activity}) =>
    `activity ${(activity * 100).toFixed(1)}% · fill ${(fill * 100).toFixed(2)}%`;

  const showStatus = () => {
    status.textContent = running
      ? `Searching… tried ${tried}, kept ${results.length}`
      : `Tried ${tried}, kept ${results.length}. ${favorites.length} starred.`;
  };

  const card = (item, starred) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.title = JSON.stringify(item.rule);
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

  const searchLoop = async () => {
    while (running) {
      // explore at random until something is starred, then mostly vary those
      const rule =
        favorites.length && Math.random() < 0.6
          ? mutate(pick(favorites).rule)
          : randomRule();
      const score = await evaluate(rule);
      tried++;
      if (score) {
        results.unshift({rule, ...score, image: snapshot()});
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
