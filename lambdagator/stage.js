import {origin, unfoldedFrom} from './lambda.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Draws layouts (see gatorLayout.js) as absolutely positioned elements and tweens between them.
// Elements are matched by key. A new element whose node was copied from an existing one starts
// where the original is, and one unfolded from a name chip grows out of the chip.
//
// Targets in the exitTo and enterFrom options are partial states like {x, y, w, h, sc, sy}, and can
// give a center {cx, cy} instead of x and y.
const place = (state, target) => {
  const {cx, cy, ...rest} = target;
  const placed = {...state, ...rest};
  if (cx !== undefined) placed.x = cx - placed.w / 2;
  if (cy !== undefined) placed.y = cy - placed.h / 2;
  return placed;
};

// an item's state once it's in place
const stateOf = (item) => ({
  x: item.x,
  y: item.y,
  w: item.w,
  h: item.h,
  sy: item.sy ?? 1,
  sc: item.sc ?? 1,
  o: 1,
  text: item.text,
  hue: item.hue ?? 0,
  c: item.c,
  em: item.em,
  k: item.k ?? 0,
});

// makes an element look like a state. lift raises it, for things flying through the air.
const applyStyle = (el, state, lift = 0) => {
  const {style} = el;
  style.transform = `translate(${state.x}px, ${state.y - lift}px) scale(${state.sc}, ${state.sc * state.sy})`;
  style.width = state.w + 'px';
  style.height = state.h + 'px';
  style.opacity = state.o;
  for (const prop of ['hue', 'c', 'em', 'k']) {
    style.setProperty(prop === 'hue' ? '--h' : '--' + prop, state[prop]);
  }
  // text goes in the element's own .text part if it has one, like an egg's name or a chip's label
  // (not in a .text inside the drawing in a chip)
  const textEl =
    el.querySelector(':scope > .text, :scope > .shell > .text') ?? el;
  if (state.text !== undefined && textEl.textContent !== state.text) {
    textEl.textContent = state.text;
  }
};

export class Stage {
  constructor(el, {onHover, onClick}) {
    this.el = el;
    this.world = el.appendChild(document.createElement('div'));
    this.world.className = 'world';
    this.elements = new Map(); // key -> {el, cur}
    this.view = {x: 0, y: 0, s: 1};
    this.animation = 0;

    const targetOf = (e) => e.target.closest?.('[data-target]')?.dataset.target;
    let hovered;
    this.world.addEventListener('pointermove', (e) => {
      const target = targetOf(e);
      if (target === hovered) return;
      hovered = target;
      onHover(target && Number(target));
    });
    this.world.addEventListener('pointerleave', () => {
      if (hovered) onHover((hovered = undefined));
    });
    this.world.addEventListener('click', (e) => {
      const target = targetOf(e);
      if (target) {
        hovered = undefined;
        onClick(Number(target));
      }
    });
  }

  clear() {
    this.animation++;
    for (const {el} of this.elements.values()) el.remove();
    this.elements.clear();
  }

  // a view that centers the layout. Layouts are centered around y = 0 unless they say where
  // their top is.
  fit({w, h, top = -h / 2}) {
    const {clientWidth: W, clientHeight: H} = this.el;
    const s = Math.min(1.4, (W - 32) / w, (H - 32) / (h + 80));
    return {x: (W - w * s) / 2, y: H / 2 - (top + h / 2) * s, s};
  }

  // where a new element should start from: what it was copied from, or the chip it unfolded from
  findSource(key) {
    const kind = key[0];
    let id = Number(key.slice(1));
    for (;;) {
      if (unfoldedFrom.has(id)) {
        const chip = this.elements.get('r' + unfoldedFrom.get(id));
        return chip && {rec: chip, unfolded: true};
      }
      if (!origin.has(id)) return;
      id = origin.get(id);
      const found = this.elements.get(kind + id);
      if (found) return {rec: found, unfolded: false};
    }
  }

  // options (all Maps keyed by item key):
  //   fly: delay (0-1). These elements arc through the air instead of sliding.
  //   exitTo: where a disappearing element should go
  //   enterFrom: where a new element should come from. It fades in on the way.
  // and holdView: true keeps the camera where it is instead of fitting the new layout
  show(
    layout,
    duration,
    {
      fly = new Map(),
      exitTo = new Map(),
      enterFrom = new Map(),
      holdView = false,
    } = {},
  ) {
    const id = ++this.animation;
    const tweens = [];
    const keys = new Set();

    for (const item of layout.items) {
      keys.add(item.key);
      const to = stateOf(item);
      let rec = this.elements.get(item.key);
      let from;
      let appearsFast = false;
      if (rec) from = rec.cur;
      else {
        const source = this.findSource(item.key);
        rec = this.create(item);
        if (source) {
          // a copy starts as its original currently is. Pieces of an unfolding chip start at the
          // chip's size and fade in as they leave it.
          const {x, y, w, h, sc} = source.rec.cur;
          appearsFast = source.unfolded;
          from = source.unfolded
            ? {...to, x, y, w, h, o: 0}
            : {...to, x, y, sc, o: 1};
        } else if (enterFrom.has(item.key)) {
          appearsFast = true;
          from = place({...to, o: 0}, enterFrom.get(item.key));
        } else from = {...to, o: 0};
        rec.cur = from;
      }
      rec.exiting = false;
      rec.el.className = `${item.kind} ${item.cls ?? ''}`;
      rec.el.style.zIndex = item.z ?? '';
      if (item.target === undefined) delete rec.el.dataset.target;
      else rec.el.dataset.target = item.target;
      tweens.push({
        rec,
        from,
        to,
        delay: fly.get(item.key) ?? 0,
        fly: fly.has(item.key),
        appearsFast,
      });
    }

    for (const [key, rec] of this.elements) {
      if (keys.has(key)) continue;
      rec.exiting = true;
      delete rec.el.dataset.target;
      tweens.push({
        rec,
        from: rec.cur,
        to: place({...rec.cur, o: 0}, exitTo.get(key) ?? {}),
        delay: 0,
        exit: exitTo.has(key) ? 'move' : 'fade',
      });
    }

    const fromView = this.view;
    const toView = holdView ? fromView : this.fit(layout);
    const maxDelay = Math.max(0, ...fly.values());

    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now) => {
        if (id !== this.animation) return resolve();
        const t = duration ? clamp01((now - start) / duration) : 1;
        const e = ease(t);
        this.view = {
          x: lerp(fromView.x, toView.x, e),
          y: lerp(fromView.y, toView.y, e),
          s: lerp(fromView.s, toView.s, e),
        };
        this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.s})`;
        for (const tw of tweens) this.tween(tw, t, maxDelay);
        if (t < 1) requestAnimationFrame(frame);
        else {
          for (const [key, rec] of this.elements) {
            if (rec.exiting) {
              rec.el.remove();
              this.elements.delete(key);
            }
          }
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  create(item) {
    const el = this.world.appendChild(document.createElement('div'));
    el.innerHTML = item.html ?? '';
    const rec = {el};
    this.elements.set(item.key, rec);
    return rec;
  }

  tween({rec, from, to, delay, fly, exit, appearsFast}, t, maxDelay) {
    const e = ease(clamp01((t - delay) / (1 - maxDelay)));
    // Things leaving fade out during the first half (or as they arrive, if they have somewhere to
    // go), and new things fade in during the second half, unless they should appear right away.
    const o = exit
      ? lerp(from.o, 0, exit === 'move' ? e ** 3 : clamp01(t * 2))
      : from.o < to.o
        ? lerp(from.o, to.o, clamp01(appearsFast ? e * 2 : e * 2 - 1))
        : lerp(from.o, to.o, e);
    const x = lerp(from.x, to.x, e);
    const y = lerp(from.y, to.y, e);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const lift =
      fly && dist > 1
        ? Math.sin(Math.PI * e) * Math.min(140, 30 + dist * 0.25)
        : 0;
    const cur = {x, y, o, text: to.text, hue: to.hue};
    for (const prop of ['w', 'h', 'sy', 'sc', 'c', 'em', 'k']) {
      cur[prop] = lerp(from[prop], to[prop], e);
    }
    rec.cur = cur;
    applyStyle(rec.el, cur, lift);
  }
}

// markup for a layout drawn without animation, like the faint drawing inside a name chip
export const staticMarkup = (layout, scale = 1) => {
  const el = document.createElement('div');
  drawStatic(layout, el, scale);
  return el.innerHTML;
};

// Draws a layout without animation, for illustrations.
export const drawStatic = (layout, el, scale = 1) => {
  el.style.width = layout.w * scale + 'px';
  el.style.height = layout.h * scale + 'px';
  const world = el.appendChild(document.createElement('div'));
  world.className = 'world';
  world.style.transform = `translate(0, ${(layout.h / 2) * scale}px) scale(${scale})`;
  for (const item of layout.items) {
    const div = world.appendChild(document.createElement('div'));
    div.className = `${item.kind} ${item.cls ?? ''}`;
    div.innerHTML = item.html ?? '';
    div.style.zIndex = item.z ?? '';
    applyStyle(div, stateOf(item));
  }
};
