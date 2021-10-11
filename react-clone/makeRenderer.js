// eslint-disable-next-line import/no-unresolved
import 'https://code.jquery.com/jquery-3.3.1.min.js';

const {$} = window;

const keys = ['attr', 'css', 'text', 'val'];
const events = ['click', 'keyup'];

// TODO: use levenshtein to more efficiently insert/remove/update elements
const reconcile = (prevDefs, defs, parent, dispatch) => {
  for (const d of prevDefs.slice(defs.length)) d.$el.remove();
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const prev = prevDefs[i];
    const makeNew = !prev || prev.tag !== def.tag;
    const el = (def.$el = makeNew
      ? $(document.createElement(def.tag || 'div'))
      : prev.$el);
    const p = makeNew ? {} : prev;
    for (const key of keys) {
      if (!eqProps(key, def, p)) el[key](def[key]);
    }
    for (const key of events) {
      if (!eqProps(key, def, p))
        el.off(key).on(key, (e) => def[key](dispatch, e));
    }
    if (def.children) {
      reconcile(makeNew ? [] : prev.children, def.children, el, dispatch);
    }
    if (!prev) $(parent).append(el);
    else if (prev.tag !== def.tag) prev.$el.replaceWith(el);
  }
};

export const makeRenderer = (parent, getElements) => {
  let prev;
  return (dispatch, state) => {
    const defs = getElements(state);
    reconcile(prev || [], defs, parent, dispatch);
    prev = defs;
  };
};
