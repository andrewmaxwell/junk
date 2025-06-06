/**
 * @typedef {{tag: string, props?: Record<string, any>, children?: Array<Tree>} | string} Tree
 * @type {(v: Tree | string | false | null | undefined) => HTMLElement | Text}
 * */
function createDom(v) {
  if (v == null || v === false) return document.createTextNode('');

  if (typeof v === 'string' || typeof v === 'number') {
    return document.createTextNode(String(v));
  }

  const el = document.createElement(v.tag);
  for (const [k, val] of Object.entries(v.props ?? {})) {
    if (k.startsWith('on') && typeof val === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), val);
    } else if (k === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else if (val !== false && val != null) {
      el.setAttribute(k, val);
    }
  }
  v.children?.flat().forEach((c) => el.appendChild(createDom(c)));
  return el;
}

/** @type {(el: HTMLElement, newP: Record<string, any>, oldP: Record<string, any>) => void} */
function updateProps(el, newP = {}, oldP = {}) {
  // removals
  for (const k in oldP)
    if (!(k in newP)) {
      if (k.startsWith('on')) {
        el.removeEventListener(k.slice(2).toLowerCase(), oldP[k]);
      } else {
        el.removeAttribute(k);
      }
    }

  // adds / updates
  for (const [k, v] of Object.entries(newP)) {
    if (k.startsWith('on')) {
      const evt = k.slice(2).toLowerCase();
      if (oldP[k]) el.removeEventListener(evt, oldP[k]);
      el.addEventListener(evt, v);
    } else if (k === 'value' && el instanceof HTMLInputElement) {
      if (el.value !== v) el.value = v; // keep cursor & focus
    } else if (oldP[k] !== v) {
      el.setAttribute(k, v);
    }
  }
}

/** @type {(parent: HTMLElement, newV: Tree, oldV: Tree, idx?: number) => void} */
function patch(parent, newV, oldV, idx = 0) {
  const node = parent.childNodes[idx];

  if (!oldV) {
    parent.appendChild(createDom(newV));
  } else if (!newV) {
    parent.removeChild(node);
  } else if (
    typeof newV !== typeof oldV ||
    (typeof newV === 'string' && newV !== oldV) ||
    (typeof newV === 'object' &&
      typeof oldV === 'object' &&
      newV.tag !== oldV.tag)
  ) {
    parent.replaceChild(createDom(newV), node);
  } else if (
    typeof newV === 'object' &&
    typeof oldV === 'object' &&
    newV.tag &&
    node instanceof HTMLElement
  ) {
    updateProps(node, newV.props ?? {}, oldV.props ?? {});
    const newChildren = newV.children ?? [];
    const oldChildren = oldV.children ?? [];
    const max = Math.max(newChildren.length, oldChildren.length);
    for (let i = 0; i < max; i++)
      patch(node, newChildren[i], oldChildren[i], i);
  }
}

/**
 * @template State
 * @param {{
 *  initialState: State,
 *  component: (state: State, setState: (func: (s: State) => Partial<State>) => void) => Tree,
 *  root: HTMLElement | null
 * }} config
 * */
export function init({initialState, component, root}) {
  if (!root) return;
  let prevTree = null;
  let state = initialState;

  const update = () => {
    const nextTree = component(state, (func) => {
      state = {...state, ...func(state)};
      update();
    });
    if (prevTree) patch(root, nextTree, prevTree);
    else root.appendChild(createDom(nextTree));
    prevTree = nextTree;
  };

  update(); // first paint
}
