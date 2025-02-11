const reconcile = (prevDefs, defs, parent, onChange) => {
  for (const d of prevDefs.slice(defs.length)) d.$el.remove(); // remove deleted items
  return defs.map((def, i) => {
    def = Object.fromEntries(def);
    const prev = prevDefs[i];
    const makeNew = !prev || prev.tag !== def.tag;
    const p = makeNew ? {} : prev;
    def.$el = makeNew ? document.createElement(def.tag || 'div') : prev.$el;
    for (const key in {...def, ...p}) {
      if (p[key] === def[key] || key.startsWith('$') || key === 'tag') continue;
      if (key === 'children') {
        def.children = reconcile(
          makeNew ? [] : prev.children,
          def.children,
          def.$el,
          onChange,
        );
      } else if (key === 'onClick') {
        def.$el.removeEventListener('click', p.$onClick);
        def.$onClick = () => onChange(def[key]);
        def.$el.addEventListener('click', def.$onClick);
      } else if (key === 'onChangeValue') {
        def.$el.removeEventListener('onInput', p.$onChangeValue);
        def.$onChangeValue = (e) => onChange(def[key], e.target.value);
        def.$el.addEventListener('input', def.$onChangeValue);
      } else if (def[key] && typeof def[key] === 'object') {
        Object.assign(def.$el[key], Object.fromEntries(def[key])); // for styles
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
  let state = initialState;
  let ui = [];
  const onChange = (stateChanger, val) => {
    const nextState = stateChanger(state, val);
    const nextUi = reconcile(ui, renderFunc(nextState), rootEl, onChange);
    [state, ui] = [nextState, nextUi];
  };
  onChange((s) => s); // initialize
};
