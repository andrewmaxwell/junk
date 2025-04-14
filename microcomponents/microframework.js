const domDiff = (prevDefs, defs, parent, onChange) => {
  for (const d of prevDefs.slice(defs.length)) d.$el.remove(); // remove deleted items
  return defs.map((def, i) => {
    if (typeof def === 'string') def = {tag: 'span', textContent: def};
    if (typeof def !== 'object') {
      console.error('Not an object:', def);
    }
    const prev = prevDefs[i];
    const makeNew = !prev || prev.tag !== def.tag;
    const p = makeNew ? {} : prev;
    def.$el = makeNew ? document.createElement(def.tag || 'div') : prev.$el;
    for (const key in {...def, ...p}) {
      if (p[key] === def[key] || key.startsWith('$') || key === 'tag') continue;
      if (key === 'children') {
        def.children = domDiff(
          makeNew ? [] : prev.children,
          def.children,
          def.$el,
          onChange,
        );
      } else if (key === 'onClick') {
        def.$el.removeEventListener('click', p.$onClick);
        def.$onClick = (e) => onChange(def[key], e);
        def.$el.addEventListener('click', def.$onClick);
      } else if (key === 'onChange') {
        def.$el.removeEventListener('onInput', p.$onChangeValue);
        def.$onChangeValue = (e) => onChange(def[key], e);
        def.$el.addEventListener('input', def.$onChangeValue);
      } else {
        def.$el[key] = def[key];
      }
    }
    if (!prev) parent.append(def.$el);
    else if (prev.tag !== def.tag) prev.$el.replaceWith(def.$el);
    return def;
  });
};

export const init = (renderFunc, initialState, rootEl) => {
  let state;
  let ui = [];
  const onChange = (stateChanger, e) => {
    const nextState = stateChanger(state, e);
    const nextUi = domDiff(ui, renderFunc(nextState), rootEl, onChange);
    [state, ui] = [nextState, nextUi];
  };
  onChange(() => initialState); // initialize
};
