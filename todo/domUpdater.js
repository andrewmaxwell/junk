/* eslint-disable no-use-before-define */
const update = (prev, next) => {
  for (const key in {...prev, ...next}) {
    if (key === 'children' || key === 'tagName' || key[0] === '$') continue;
    if (prev[key] !== next[key]) {
      console.log('updated', key, prev[key], '-->', next[key]);
      next.$el[key] = next[key];
    }
  }

  if (Array.isArray(next.children)) {
    const pc = prev.children || [];
    for (let i = 0; i < pc.length || i < next.children.length; i++) {
      reconcile(pc[i], next.children[i], next.$el);
    }
  }
};

const reconcile = (prev, next, parent) => {
  if (prev && !next) {
    prev.$el.remove();
    console.log('removed', prev);
  } else if (next && (!prev || prev.tagName !== next.tagName)) {
    next.$el = document.createElement(next.tagName);
    update({}, next);
    if (prev) {
      parent.replaceChild(next.$el, prev.$el);
      console.log('replaced', prev, 'with', next);
    } else {
      parent.append(next.$el);
      console.log('added', next);
    }
  } else if (prev && next && prev.tagName === next.tagName) {
    next.$el = prev.$el;
    update(prev, next);
  }
};

export const makeDomUpdater = (parent, toView) => {
  let prev;
  return () => {
    const next = toView();
    reconcile(prev, next, parent);
    prev = next;
  };
};
