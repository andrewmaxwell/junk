import {makeEvaluator, isLively, mutate} from './search.js';
import {makeRenderer} from './render.js';
import {packPattern, place, unpackPattern} from './pattern.js';

const storageKey = 'lenia3d-creatures';
const maxResults = 48; // not counting favorites

const loadFavorites = () => {
  try {
    return (JSON.parse(localStorage.getItem(storageKey)) ?? []).map((f) => ({
      ...f,
      pattern: unpackPattern(f.pattern),
    }));
  } catch {
    return [];
  }
};
const saveFavorites = (favorites) => {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(
        favorites.map((f) => ({...f, pattern: packPattern(f.pattern)})),
      ),
    );
  } catch {
    // private window or full storage: favorites just won't outlast the page
  }
};

// Searches in the background and shows what it keeps as thumbnails. Each try
// takes a creature (one of Chan's, a starred one, or an earlier find), nudges
// its rule, and runs it from that creature's own shape. Clicking a card calls
// onPick with its rule and shape.
export const makeGallery = (device, species, onPick) => {
  const N = 64;
  const {sim, evaluate} = makeEvaluator(device, N);

  // thumbnails are drawn by the same renderer, from the search's small world
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbCanvas.height = 256;
  const thumbContext = thumbCanvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  thumbContext.configure({device, format});
  const renderThumb = makeRenderer(device, thumbContext, format, sim);
  const snapshot = (pattern) => {
    sim.setState(place(pattern, N)); // centered, rather than wherever it got to
    const encoder = device.createCommandEncoder();
    sim.step(encoder, 1);
    renderThumb(encoder, {
      yaw: 0.6,
      pitch: 0.35,
      distance: 1.1,
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

  const describe = ({speed, pulse}) =>
    [
      speed > 2 && `glides ${speed.toFixed(0)}`,
      pulse > 0.04 && `pulses ${(pulse * 100).toFixed(0)}%`,
    ]
      .filter(Boolean)
      .join(' · ');

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
    caption.textContent = `${item.rule.species} · ${describe(item)}`;
    div.addEventListener('click', () => onPick(item.rule, item.pattern));
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
  const lineage = (item) => item.rule.species;
  // a random lineage first, then one of its members, so the one that's
  // easiest to vary doesn't crowd out the rest
  const pickBalanced = (items) => {
    const name = pick([...new Set(items.map(lineage))]);
    return pick(items.filter((item) => lineage(item) === name));
  };

  // Mostly carry on from things that already do something (depth first, as
  // Chan did), sometimes go back to one of his creatures.
  const pickParent = () => {
    const r = Math.random();
    if (favorites.length && r < 0.4) return pickBalanced(favorites);
    if (results.length && r < 0.75) return pickBalanced(results);
    return pick(species);
  };

  // when full, drop the oldest of the most common lineage
  const trim = () => {
    while (results.length > maxResults) {
      const counts = {};
      for (const r of results)
        counts[lineage(r)] = (counts[lineage(r)] ?? 0) + 1;
      const most = Object.keys(counts).reduce((a, b) =>
        counts[a] >= counts[b] ? a : b,
      );
      results.splice(
        results.findLastIndex((r) => lineage(r) === most),
        1,
      );
    }
  };

  const searchLoop = async () => {
    while (running) {
      const parent = pickParent();
      const rule = mutate(parent.rule);
      const result = await evaluate(rule, parent.pattern);
      tried++;
      if (result && isLively(result)) {
        results.unshift({rule, ...result, image: snapshot(result.pattern)});
        trim();
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
