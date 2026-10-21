const container = document.getElementById('projectContainer');
const searchInput = document.getElementById('searchInput');
const summary = document.getElementById('summary');

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        c
      ],
  );

let data;
try {
  const response = await fetch('./home/data.json');
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  data = await response.json();
} catch (e) {
  container.innerHTML = `<p class="message">Couldn't load the project list (${esc(e.message)}). Try reloading.</p>`;
  throw e;
}

const firstYear = Math.min(...data.map((p) => p.year));
summary.textContent = `${data.length} experiments since ${firstYear}: simulations, games, visualizations and a few odd tools. Nearly all of them run right here in your browser.`;

// Every word of the query has to appear somewhere. Matches in the title count most, then the
// description, then the README. Returns 0 for no match.
const score = (p, words) => {
  let total = 0;
  for (const w of words) {
    const title = p.title.toLowerCase();
    const s =
      (title.startsWith(w) ? 15 : title.includes(w) ? 10 : 0) +
      (p.desc.toLowerCase().includes(w) ? 4 : 0) +
      (String(p.year) === w ? 5 : 0) +
      (p.text.toLowerCase().includes(w) ? 1 : 0);
    if (!s) return 0;
    total += s;
  }
  return total;
};

// escaped text with the query words wrapped in <mark>
const highlight = (text, words) => {
  if (!words.length) return esc(text);
  const pattern = [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  let html = '';
  let last = 0;
  for (const m of text.matchAll(new RegExp(pattern, 'gi'))) {
    html += `${esc(text.slice(last, m.index))}<mark>${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return html + esc(text.slice(last));
};

// a bit of README around the first word that only matched there, to show why it's a result
const snippet = (p, words) => {
  const w = words.find(
    (w) =>
      !p.title.toLowerCase().includes(w) && !p.desc.toLowerCase().includes(w),
  );
  const i = w ? p.text.toLowerCase().indexOf(w) : -1;
  if (i < 0) return '';
  const start = Math.max(0, p.text.lastIndexOf(' ', i - 50) + 1);
  const end = p.text.indexOf(' ', i + w.length + 70);
  const text = p.text.slice(start, end < 0 ? undefined : end);
  return `<div class="snippet">${start ? '…' : ''}${highlight(text, words)}${end < 0 ? '' : '…'}</div>`;
};

let animate = true;
const card = (p, words, index) =>
  `<a href="${esc(p.filePath)}/" class="item${animate ? ' entering' : ''}" style="animation-delay: ${Math.min(index, 12) * 0.04}s"${p.preview ? ` data-preview="home/previews/${esc(p.filePath)}.mp4"` : ''}>
    <div class="image-container">
      <img src="home/thumbs/${esc(p.filePath)}.webp" loading="${index < 8 ? 'eager' : 'lazy'}" alt="" onload="this.classList.add('loaded')"/>
    </div>
    <div class="item-content">
      <div class="title-row">
        <strong>${highlight(p.title, words)}</strong>
        ${words.length ? `<span class="year-badge">${p.year}</span>` : ''}
      </div>
      <div class="desc">${highlight(p.desc, words)}</div>
      ${words.length ? snippet(p, words) : ''}
    </div>
  </a>`;

const surpriseButton = `<button class="surprise" type="button">Surprise me</button>`;

let results = data;
function render() {
  const query = searchInput.value.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length) {
    results = data
      .map((p) => ({p, s: score(p, words)}))
      .filter((r) => r.s)
      .sort((a, b) => b.s - a.s || b.p.year - a.p.year)
      .map((r) => r.p);
    container.innerHTML = results.length
      ? `<section><h2>${results.length} match${results.length === 1 ? '' : 'es'}</h2><div class="grid">${results.map((p, i) => card(p, words, i)).join('')}</div></section>`
      : `<p class="message">Nothing matched “${esc(searchInput.value.trim())}”. ${surpriseButton}</p>`;
  } else {
    results = data;
    const years = [...new Set(data.map((p) => p.year))];
    let index = 0;
    container.innerHTML = years
      .map((year) => {
        const projects = data.filter((p) => p.year === year);
        return `<section><h2>${year} <span>${projects.length}</span></h2><div class="grid">${projects.map((p) => card(p, words, index++)).join('')}</div></section>`;
      })
      .join('');
  }
  animate = false;
  watchPreviews();
}

const surprise = () => {
  const p = data[Math.floor(Math.random() * data.length)];
  location.href = `${p.filePath}/`;
};

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  history.replaceState(
    null,
    '',
    q ? `?q=${encodeURIComponent(q)}` : location.pathname,
  );
  render();
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && results.length && searchInput.value.trim()) {
    location.href = `${results[0].filePath}/`;
  } else if (e.key === 'Escape') {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('.surprise')) surprise();
});

// Previews: short muted loops of each project running. With a mouse they play on hover; on a
// touch screen they play while the card is in the middle of the screen.
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
const calm =
  matchMedia('(prefers-reduced-motion: reduce)').matches ||
  navigator.connection?.saveData;

const play = (item) => {
  let video = item.querySelector('video');
  if (!video) {
    video = document.createElement('video');
    Object.assign(video, {muted: true, loop: true, playsInline: true});
    video.src = item.dataset.preview;
    video.addEventListener('playing', () => video.classList.add('playing'));
    item.querySelector('.image-container').append(video);
  }
  video.play().catch(() => {});
};

const stop = (item) => {
  const video = item.querySelector('video');
  if (!video) return;
  video.pause();
  video.classList.remove('playing');
};

const centered = new IntersectionObserver(
  (entries) => {
    for (const {target, isIntersecting} of entries) {
      if (isIntersecting) play(target);
      else stop(target);
    }
  },
  {rootMargin: '-35% 0px -35% 0px'},
);

function watchPreviews() {
  centered.disconnect();
  for (const item of container.querySelectorAll('[data-preview]')) {
    if (canHover) {
      item.addEventListener('mouseenter', () => play(item));
      item.addEventListener('mouseleave', () => stop(item));
    } else if (!calm) {
      centered.observe(item);
    }
  }
}

searchInput.value = new URLSearchParams(location.search).get('q') || '';
render();
